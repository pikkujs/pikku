import { LogLevel, type Logger } from '../services/logger.js'
import type { TraceContext } from '../trace.js'
import { NOOP_TRACER, type Tracer } from '../tracer.js'
import { parseOtlpEndpoint } from './loopback.js'
import { OtlpHttpExporter } from './otlp-http-exporter.js'
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
  /** False when telemetry is off: everything below is inert. */
  enabled: boolean
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
  tracer: NOOP_TRACER,
  logger,
  currentTrace: () => undefined,
  recordSqlText: false,
  stopMetrics() {},
  flush: async () => {},
  close: async () => {},
})

/**
 * Builds the tracer, OTLP logger and process-metrics sampler a runtime injects,
 * from `PIKKU_OTLP_*` (see the table in the Tracing docs). Unset endpoint or
 * `PIKKU_TELEMETRY=0` gives the no-op tracer and the plain logger. A
 * non-loopback endpoint throws unless `PIKKU_OTLP_ALLOW_REMOTE=1`: this is read
 * at boot, never by app code.
 */
export const createRuntimeTelemetry = (
  env: Env,
  options: RuntimeTelemetryOptions
): RuntimeTelemetry => {
  const endpoint = env.PIKKU_OTLP_ENDPOINT?.trim()
  if (env.PIKKU_TELEMETRY === '0' || !endpoint) return inert(options.logger)

  const url = parseOtlpEndpoint(endpoint, env.PIKKU_OTLP_ALLOW_REMOTE === '1')
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
  const exporter = new OtlpHttpExporter({
    endpoint: url.href,
    headers,
    headersBySignal,
    resource: {
      serviceName:
        env.PIKKU_OTLP_SERVICE_NAME?.trim() || project || options.serviceName,
      ...(options.version ? { serviceVersion: options.version } : {}),
      ...(stage ? { environment: stage, stage } : {}),
      ...(project ? { project } : {}),
    },
    logger: options.logger,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })

  const tracer = new OtlpTracer(exporter, {
    ...(options.contextStorage
      ? { contextStorage: options.contextStorage }
      : {}),
  })
  const logger = new OtlpLogger(options.logger, exporter, {
    minLevel,
    ...(options.contextStorage
      ? { currentContext: () => options.contextStorage!.get() }
      : {}),
  })
  const metrics = startProcessMetrics(exporter)

  return {
    enabled: true,
    tracer,
    logger,
    currentTrace: () => options.contextStorage?.get(),
    recordSqlText: env.PIKKU_OTLP_SQL_TEXT === '1',
    stopMetrics: () => metrics.stop(),
    flush: () => exporter.flush(),
    close: async () => {
      metrics.stop()
      await exporter.close()
    },
  }
}
