import type { Contributor } from '@pikku/core/contributors'
import {
  GreptimeTelemetryStore,
  type GreptimeStoreOptions,
} from './greptime-store.js'
import { startRetentionJob } from './retention.js'

type Env = Record<string, string | undefined>

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const required = (env: Env, name: string, why: string): string => {
  const value = env[name]
  if (!value) {
    throw new Error(
      `The greptime contributor needs ${name} (${why}). It never falls back to the in-memory telemetry store: set ${name}, or remove 'greptime' from the addon's contributors.`
    )
  }
  return value
}

/**
 * Everything the store needs from the environment. The connection is
 * fail-closed: a database that is not on this machine must be reached with
 * credentials, and a half-set pair is refused rather than ignored.
 */
export const greptimeOptionsFromEnv = (env: Env): GreptimeStoreOptions => {
  const url = required(env, 'PIKKU_GREPTIME_URL', 'the GreptimeDB HTTP address')
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`PIKKU_GREPTIME_URL '${url}' is not a URL`)
  }
  const username = env.PIKKU_GREPTIME_USER || undefined
  const password = env.PIKKU_GREPTIME_PASSWORD || undefined
  if (Boolean(username) !== Boolean(password)) {
    throw new Error(
      'Set both PIKKU_GREPTIME_USER and PIKKU_GREPTIME_PASSWORD, or neither.'
    )
  }
  if (!username && !LOOPBACK.has(host)) {
    throw new Error(
      `PIKKU_GREPTIME_URL points at ${host}, which is not this machine, so PIKKU_GREPTIME_USER and PIKKU_GREPTIME_PASSWORD are required.`
    )
  }
  const timeout = env.PIKKU_GREPTIME_TIMEOUT_MS
  return {
    url,
    database: env.PIKKU_GREPTIME_DB || 'pikku',
    username,
    password,
    timeoutMs: timeout ? Number(timeout) : undefined,
    ttl: env.PIKKU_GREPTIME_TTL || undefined,
  }
}

/**
 * Provides `telemetryStore`: a `TelemetryStore` over GreptimeDB. `run` only
 * builds it (no network); `onServerStart` checks the server answers and creates
 * the database, so a bad address fails the start, not the first request.
 */
const stops = new WeakMap<GreptimeTelemetryStore, () => void>()
/** What `run` read from the environment for the start hook, which gets no env. */
const retention = new WeakMap<
  GreptimeTelemetryStore,
  { days: number; maxMb?: number }
>()

/** Opt in: Studio schedules retention itself, so an app runs the job only when told how many days to keep. */
const retentionFromEnv = (env: Env) => {
  const days = env.PIKKU_GREPTIME_RETENTION_DAYS
  if (!days) return undefined
  const keep = Number(days)
  if (!Number.isSafeInteger(keep) || keep < 1) {
    throw new Error(
      `PIKKU_GREPTIME_RETENTION_DAYS '${days}' is not a whole number of days`
    )
  }
  const cap = env.PIKKU_GREPTIME_MAX_MB
  if (cap && !(Number(cap) > 0)) {
    throw new Error(`PIKKU_GREPTIME_MAX_MB '${cap}' is not a number of MiB`)
  }
  return { days: keep, maxMb: cap ? Number(cap) : undefined }
}

/**
 * Provides `telemetryStore`: a `TelemetryStore` over GreptimeDB. `run` only
 * builds it (no network); `onServerStart` checks the server answers and creates
 * the database, so a bad address fails the start, not the first request.
 */
export const createGreptimeContributor = (
  create: (options: GreptimeStoreOptions) => GreptimeTelemetryStore = (
    options
  ) => new GreptimeTelemetryStore(options)
): Contributor => ({
  provides: ['telemetryStore'],
  run(services, env) {
    const store = create(greptimeOptionsFromEnv(env))
    const job = retentionFromEnv(env)
    if (job) retention.set(store, job)
    services.telemetryStore = store
  },
  async onServerStart(services) {
    const store: GreptimeTelemetryStore = services.telemetryStore
    await store.ping()
    await store.ensureDatabase()
    const job = retention.get(store)
    if (job) {
      stops.set(
        store,
        startRetentionJob(store, {
          ...job,
          warn: (message) => services.logger?.warn(message),
        })
      )
    }
  },
  async onServerStop(services) {
    const store: GreptimeTelemetryStore = services.telemetryStore
    stops.get(store)?.()
    stops.delete(store)
    await store.close()
  },
})

export const greptimeTelemetry = createGreptimeContributor()
