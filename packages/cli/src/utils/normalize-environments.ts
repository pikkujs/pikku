import type { PikkuCLIInput, PikkuEnvironment } from '../../types/config.js'
import { PikkuCLIConfigError } from './pikku-cli-config-error.js'

const OLD_FLAT_KEYS: Record<string, string> = {
  apiUrl: 'backends.<name>.url (or omit it for a backend with dev.port)',
  appUrl: 'frontends.<name>',
  appUrls: 'frontends.<name>',
  signInPath: 'backends.<name>.signInPath',
  sessionPath: 'backends.<name>.sessionPath',
  rpcPath: 'backends.<name>.rpcPath',
}
const ENVIRONMENT_KEYS = ['backends', 'frontends', 'production']
const BACKEND_KEYS = ['url', 'signInPath', 'sessionPath', 'rpcPath']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * `environments` as written -> `PikkuEnvironment`: string shorthands expanded,
 * a backend with no `url` given http://localhost:<dev.port>, and every name
 * checked against the backends the project declares.
 */
export const normalizeEnvironments = (
  config: Pick<PikkuCLIInput, 'environments' | 'backends' | 'addon'>,
  file: string
): Record<string, PikkuEnvironment> | undefined => {
  const raw = config.environments as unknown
  if (raw === undefined) return undefined
  if (!isRecord(raw)) {
    throw new PikkuCLIConfigError(`environments in ${file} must be an object.`)
  }
  const declared = (config.backends ?? {}) as Record<
    string,
    { dev?: { port?: number } }
  >
  const out: Record<string, PikkuEnvironment> = {}

  for (const [name, entry] of Object.entries(raw)) {
    const at = `environments.${name}`
    if (!isRecord(entry)) {
      throw new PikkuCLIConfigError(`${at} in ${file} must be an object.`)
    }
    for (const key of Object.keys(entry)) {
      if (key in OLD_FLAT_KEYS) {
        throw new PikkuCLIConfigError(
          `${at}.${key} in ${file} is now ${at}.${OLD_FLAT_KEYS[key]}. An environment names its backends and frontends: { "backends": { "api": "https://…" }, "frontends": { "web": "https://…" } }.`
        )
      }
      if (!ENVIRONMENT_KEYS.includes(key)) {
        throw new PikkuCLIConfigError(
          `${at}.${key} in ${file} is not a pikku.config.json key. Keys under ${at}: ${ENVIRONMENT_KEYS.join(', ')}.`
        )
      }
    }
    if (!isRecord(entry.backends) || Object.keys(entry.backends).length === 0) {
      throw new PikkuCLIConfigError(
        `${at}.backends in ${file} must name at least one backend: { "api": "https://…" }.`
      )
    }
    if (
      entry.production !== undefined &&
      typeof entry.production !== 'boolean'
    ) {
      throw new PikkuCLIConfigError(
        `${at}.production in ${file} must be true or false.`
      )
    }

    const backends: PikkuEnvironment['backends'] = {}
    for (const [backend, value] of Object.entries(entry.backends)) {
      const here = `${at}.backends.${backend}`
      if (!config.addon && !(backend in declared)) {
        throw new PikkuCLIConfigError(
          `${here} in ${file} names a backend this project does not declare. Declared: ${Object.keys(declared).join(', ') || '(none)'}.`
        )
      }
      const spec = typeof value === 'string' ? { url: value } : value
      if (!isRecord(spec)) {
        throw new PikkuCLIConfigError(
          `${here} in ${file} must be a URL or { url, signInPath, sessionPath, rpcPath }.`
        )
      }
      for (const key of Object.keys(spec)) {
        if (!BACKEND_KEYS.includes(key)) {
          throw new PikkuCLIConfigError(
            `${here}.${key} in ${file} is not a pikku.config.json key. Keys under ${here}: ${BACKEND_KEYS.join(', ')}.`
          )
        }
      }
      let url = spec.url as string | undefined
      if (url === undefined) {
        const port = declared[backend]?.dev?.port
        if (port === undefined) {
          throw new PikkuCLIConfigError(
            `${here} in ${file} has no url, and backends.${backend}.dev.port is not set to derive http://localhost:<port> from.`
          )
        }
        url = `http://localhost:${port}`
      }
      if (typeof url !== 'string' || !url) {
        throw new PikkuCLIConfigError(`${here}.url in ${file} must be a URL.`)
      }
      backends[backend] = {
        url,
        ...(spec.signInPath ? { signInPath: spec.signInPath as string } : {}),
        ...(spec.sessionPath
          ? { sessionPath: spec.sessionPath as string }
          : {}),
        ...(spec.rpcPath ? { rpcPath: spec.rpcPath as string } : {}),
      }
    }

    const frontends: Record<string, string> = {}
    if (entry.frontends !== undefined) {
      if (!isRecord(entry.frontends)) {
        throw new PikkuCLIConfigError(
          `${at}.frontends in ${file} must map a frontend name to its URL.`
        )
      }
      for (const [frontend, url] of Object.entries(entry.frontends)) {
        if (typeof url !== 'string' || !url) {
          throw new PikkuCLIConfigError(
            `${at}.frontends.${frontend} in ${file} must be a URL.`
          )
        }
        frontends[frontend] = url
      }
    }

    out[name] = {
      backends,
      frontends,
      ...(entry.production ? { production: true } : {}),
    }
  }
  return out
}
