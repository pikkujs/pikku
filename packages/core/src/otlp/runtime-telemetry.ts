import { LogLevel, type Logger } from '../services/logger.js'
import type { TraceContext } from '../trace.js'
import { NOOP_TRACER, type Tracer } from '../tracer.js'
import { parseOtlpEndpoint } from './loopback.js'
import { OtlpHttpExporter } from './otlp-http-exporter.js'
import { fanOutOtlp, OtlpSinkRegistry } from './otlp-sink.js'
import { OtlpLogger } from './otlp-logger.js'
import { OtlpTracer, type ContextStorage } from './otlp-tracer.js'
import { startProcessMetrics } from './process-metrics.js'

export interface RuntimeTelemetryOptions {
  /** The logger the app already has; the OTLP logger writes through it. */
  logger: Logger
  /** `service.name` when neither `PIKKU_OTLP_SERVICE_NAME` nor `PIKKU_PROJECT` is set. */
  serviceName: string
  version?: string
  /** A runtime with `AsyncLocalStorage` passes one in; core never imports it. */
  contextStorage?: ContextStorage
  /** The `fetch` to use; tests inject one. */
  fetch?: typeof fetch
}

export interface RuntimeTelemetry {
  /** False only when `PIKKU_TELEMETRY` turns telemetry off: the tracer, logger and sampler are then inert. */
  enabled: boolean
  /**
   * The sinks spans, logs and metrics go to. Hand it to `createSingletonServices`
   * as `otlpSinks`. It exists, and accepts `add`, even when telemetry is off.
   */
  otlpSinks: OtlpSinkRegistry
  tracer: Tracer
  logger: Logger
  /**
   * The context of the span whose work is running, read per query by the
   * Kysely trace plugin. Undefined when no `contextStorage` was given (an
   * edge runtime): the plugin then records no db span rather than a wrongly
   * parented one.
   */
  currentTrace: () => TraceContext | undefined
  /** `PIKKU_OTLP_SQL_TEXT=1`: the Kysely plugin may record parameterised SQL. */
  recordSqlText: boolean
  stopMetrics(): void
  /** Sends what is buffered. Never rejects. */
  flush(): Promise<void>
  /** Stops sampling, flushes (capped at two seconds) and refuses further records. */
  close(): Promise<void>
}

/**
 * Shapes an `AsyncLocalStorage<TraceContext>` as the {@link ContextStorage} the
 * tracer takes, so core never imports `node:async_hooks` itself:
 * `asContextStorage(new AsyncLocalStorage())`.
 */
export const asContextStorage = (storage: {
  run<T>(context: TraceContext, fn: () => T): T
  getStore(): TraceContext | undefined
}): ContextStorage => ({
  run: (context, fn) => storage.run(context, fn),
  get: () => storage.getStore(),
})

type Env = Record<string, string | undefined>

const LEVELS: Record<string, LogLevel> = {
  trace: LogLevel.trace,
  debug: LogLevel.debug,
  info: LogLevel.info,
  warn: LogLevel.warn,
  error: LogLevel.error,
  critical: LogLevel.critical,
}

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/

/**
 * `k=v,k2=v2` with percent-encoded values (so a value may hold `,` or `=`).
 * Throws on a malformed entry: a header that is silently dropped would send
 * telemetry to the wrong database.
 */
export const parseOtlpHeaders = (
  raw: string | undefined,
  variable = 'PIKKU_OTLP_HEADERS'
): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const entry of (raw ?? '').split(',')) {
    if (entry.trim() === '') continue
    const at = entry.indexOf('=')
    const name = (at < 0 ? entry : entry.slice(0, at)).trim()
    if (at < 0 || !HEADER_NAME.test(name)) {
      throw new Error(`${variable} must be comma-separated name=value pairs`)
    }
    let value: string
    try {
      value = decodeURIComponent(entry.slice(at + 1).trim())
    } catch {
      throw new Error(`${variable} has a bad percent-encoding for ${name}`)
    }
    if (/[\r\n]/.test(value)) {
      throw new Error(`${variable} value for ${name} contains a line break`)
    }
    headers[name] = value
  }
  return headers
}

const inert = (logger: Logger): RuntimeTelemetry => ({
  enabled: false,
  otlpSinks: new OtlpSinkRegistry(),
  tracer: NOOP_TRACER,
  logger,
  currentTrace: () => undefined,
  recordSqlText: false,
  stopMetrics() {},
  flush: async () => {},
  close: async () => {},
})

/** `0`, `false` and `off`, trimmed and case-insensitive, turn telemetry off. */
const telemetryDisabled = (value: string | undefined): boolean =>
  ['0', 'false', 'off'].includes(value?.trim().toLowerCase() ?? '')

/**
 * Builds the tracer, OTLP logger and process-metrics sampler a runtime injects.
 * They always write to the {@link RuntimeTelemetry.otlpSinks} registry. The HTTP
 * exporter is registered as a sink only when `PIKKU_OTLP_ENDPOINT` is set (see
 * the table in the Tracing docs); `PIKKU_TELEMETRY=0|false|off` gives the no-op
 * tracer and the plain logger instead. A non-loopback endpoint throws unless
 * `PIKKU_OTLP_ALLOW_REMOTE=1`: this is read at boot, never by app code.
 */
export const createRuntimeTelemetry = (
  env: Env,
  options: RuntimeTelemetryOptions
): RuntimeTelemetry => {
  if (telemetryDisabled(env.PIKKU_TELEMETRY)) return inert(options.logger)

  const endpoint = env.PIKKU_OTLP_ENDPOINT?.trim()
  const url = endpoint
    ? parseOtlpEndpoint(endpoint, env.PIKKU_OTLP_ALLOW_REMOTE === '1')
    : undefined
  const headers = parseOtlpHeaders(env.PIKKU_OTLP_HEADERS)
  const headersBySignal = {
    traces: parseOtlpHeaders(
      env.PIKKU_OTLP_TRACES_HEADERS,
      'PIKKU_OTLP_TRACES_HEADERS'
    ),
    logs: parseOtlpHeaders(
      env.PIKKU_OTLP_LOGS_HEADERS,
      'PIKKU_OTLP_LOGS_HEADERS'
    ),
    metrics: parseOtlpHeaders(
      env.PIKKU_OTLP_METRICS_HEADERS,
      'PIKKU_OTLP_METRICS_HEADERS'
    ),
  }

  const levelName = env.PIKKU_OTLP_LOG_LEVEL?.trim().toLowerCase()
  let minLevel = LogLevel.info
  if (levelName) {
    if (levelName in LEVELS) minLevel = LEVELS[levelName]!
    else {
      options.logger.warn(
        `PIKKU_OTLP_LOG_LEVEL "${levelName}" is not a log level; using info`
      )
    }
  }

  const stage = env.PIKKU_STAGE?.trim() || undefined
  const project = env.PIKKU_PROJECT?.trim() || undefined
  const resource = {
    serviceName:
      env.PIKKU_OTLP_SERVICE_NAME?.trim() || project || options.serviceName,
    ...(options.version ? { serviceVersion: options.version } : {}),
    ...(stage ? { environment: stage, stage } : {}),
    ...(project ? { project } : {}),
  }

  const otlpSinks = new OtlpSinkRegistry()
  otlpSinks.setResource(resource)
  if (url) {
    otlpSinks.add(
      new OtlpHttpExporter({
        endpoint: url.href,
        headers,
        headersBySignal,
        resource,
        logger: options.logger,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      })
    )
  }
  const fanOut = fanOutOtlp(otlpSinks)

  const tracer = new OtlpTracer(fanOut, {
    ...(options.contextStorage
      ? { contextStorage: options.contextStorage }
      : {}),
  })
  const logger = new OtlpLogger(options.logger, fanOut, {
    minLevel,
    fields: env.PIKKU_OTLP_LOG_FIELDS === '1',
    ...(options.contextStorage
      ? {
          currentContext: () => options.contextStorage!.get(),
          contextAttributes: (context) => tracer.attributesOf(context),
        }
      : {}),
  })
  const metrics = startProcessMetrics(fanOut)

  return {
    enabled: true,
    otlpSinks,
    tracer,
    logger,
    currentTrace: () => options.contextStorage?.get(),
    recordSqlText: env.PIKKU_OTLP_SQL_TEXT === '1',
    stopMetrics: () => metrics.stop(),
    flush: () => fanOut.flush(),
    close: async () => {
      metrics.stop()
      await fanOut.close()
    },
  }
}
