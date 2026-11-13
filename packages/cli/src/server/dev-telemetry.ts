import { AsyncLocalStorage } from 'node:async_hooks'
import { basename } from 'path'
import { asContextStorage, createRuntimeTelemetry } from '@pikku/core/otlp'
import type { RuntimeTelemetry } from '@pikku/core/otlp'
import { ConsoleLogger } from '@pikku/core/services'

export interface DevTelemetryOptions {
  /** `inline` serves from this process; `parent` only supervises backends, which serve and send their own telemetry. */
  mode: 'inline' | 'parent'
  env: NodeJS.ProcessEnv
  rootDir: string
  /** The backend this process serves, when it serves one of several. */
  backend?: string
  version?: string
  fetch?: typeof fetch
}

/**
 * The runtime telemetry of `pikku dev`, built from `PIKKU_OTLP_*` exactly as `pikku serve` builds its own. A process that only
 * supervises gets an empty environment, so it is inert and sends nothing; the backends it starts inherit the variables and send.
 * When one of several backends is served, its service name carries the backend (`<name>.<backend>`), so the backends of one dev
 * server can be told apart in the store; `PIKKU_PROJECT` and `PIKKU_STAGE` still name the project and stage for all of them.
 */
export const createDevTelemetry = (
  options: DevTelemetryOptions
): RuntimeTelemetry => {
  const env: NodeJS.ProcessEnv = options.mode === 'inline' ? { ...options.env } : {}
  const name =
    env.PIKKU_OTLP_SERVICE_NAME?.trim() ||
    env.PIKKU_PROJECT?.trim() ||
    basename(options.rootDir)
  if (options.backend && env.PIKKU_OTLP_ENDPOINT) {
    env.PIKKU_OTLP_SERVICE_NAME = `${name}.${options.backend}`
  }
  return createRuntimeTelemetry(env, {
    logger: new ConsoleLogger(),
    serviceName: name,
    ...(options.version ? { version: options.version } : {}),
    contextStorage: asContextStorage(new AsyncLocalStorage()),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
}
