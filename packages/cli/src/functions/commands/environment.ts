/**
 * Resolving `pikku scenario run <environment>` and `pikku virtual-user run
 * <environment>` to the URLs the run targets.
 *
 * The configured environment is the base; `--api-url`/`--app-url` override it
 * for one invocation, which is what makes a suite runnable against a target
 * that only exists at run time (a freshly provisioned sandbox) without writing
 * a pikku.config.json per deployment.
 */

import type { PikkuEnvironment } from '../../../types/config.js'

export type { PikkuEnvironment }

/**
 * An environment narrowed to the one backend a run drives: the flat shape the
 * runners (scenarios, virtual users, browser steps) work with.
 */
export interface ResolvedEnvironment {
  /** The backend entry of the environment this run signs in to and calls. */
  backend: string
  apiUrl: string
  signInPath?: string
  /**
   * Where the session and its roles are read back, for a stage that reports
   * them somewhere other than `get-session` under the sign-in path's own mount.
   */
  sessionPath?: string
  rpcPath?: string
  /** The fallback frontend for a virtual user that names no app. */
  appUrl?: string
  /**
   * Where each app is served, keyed by the `app` its virtual users declare
   * (the frontend's name). A browser step navigates against its virtual user's
   * app; `appUrl` is the fallback for one that names none.
   */
  appUrls?: Record<string, string>
  /** Real consequences: only an `accountable` virtual user may run against it. */
  production?: boolean
}

/**
 * The backend a run drives: the one asked for, else the environment's only
 * backend. Two or more with none named is an error rather than a guess.
 */
export const pickEnvironmentBackend = (
  name: string,
  environment: PikkuEnvironment,
  backend?: string
): string => {
  const names = Object.keys(environment.backends)
  if (names.length === 0) {
    throw new Error(
      `Environment '${name}' declares no backend, and this command calls one. Declare a backend in pikku.config.json and name it under environments.${name}.backends.`
    )
  }
  if (backend !== undefined) {
    if (!(backend in environment.backends)) {
      throw new Error(
        `Environment '${name}' has no backend '${backend}'. Its backends: ${names.join(', ')}.`
      )
    }
    return backend
  }
  if (names.length === 1) return names[0]!
  throw new Error(
    `Environment '${name}' has ${names.length} backends (${names.join(', ')}); say which one to call with --backend <name> or a \`backend\` on the step.`
  )
}

/** The frontend marked `primary`, whose URL is an environment's fallback app. */
export const primaryFrontendName = (
  frontends: Record<string, { primary?: boolean }> | undefined
): string | undefined =>
  Object.entries(frontends ?? {}).find(([, frontend]) => frontend.primary)?.[0]

export interface ResolveEnvironmentOptions {
  /** The name given on the command line. Must exist in config. */
  environment: string
  environments: Record<string, PikkuEnvironment>
  /** `--backend`: which of the environment's backends to call. */
  backend?: string
  /** The frontend whose URL is the fallback when several are configured. */
  primaryFrontend?: string
  /** `--api-url`, overriding the configured `apiUrl`. */
  apiUrl?: string
  /** `--app-url`, overriding the configured `appUrl`. */
  appUrl?: string
  /** `--spawn`, which is only coherent against a local `apiUrl`. */
  spawn?: boolean
}

const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
])

/**
 * Whether a resolved URL names a server on this machine.
 *
 * The gate for anything the runner does to a target directly rather than
 * through its API — reaching into its database, for one. A remote host is
 * somebody else's data whatever the config asked for.
 */
export const isLocalUrl = (value: string): boolean => {
  try {
    return LOCAL_HOSTNAMES.has(new URL(value).hostname)
  } catch {
    return false
  }
}

/**
 * Absolute URLs only: the value is concatenated with paths (`${apiUrl}/rpc`)
 * and parsed by the spawn path, so a relative one fails far from its cause.
 */
const assertAbsoluteUrl = (flag: string, value: string): URL => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(
      `${flag} '${value}' is not a valid absolute URL — pass one including the scheme, e.g. ${flag} https://sandbox-a1b2.example.com/api`
    )
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `${flag} '${value}' must be an http(s) URL, not '${url.protocol.replace(':', '')}'.`
    )
  }
  return url
}

/**
 * Applied once, so virtual users, step env, the browser driver and the spawned server
 * all see the same target. The environment is still looked up by name: the
 * flags override fields on a configured environment, they do not invent one.
 */
export const resolveEnvironment = ({
  environment,
  environments,
  backend,
  primaryFrontend,
  apiUrl,
  appUrl,
  spawn = false,
}: ResolveEnvironmentOptions): ResolvedEnvironment => {
  const configured = environments[environment]
  if (!configured) {
    const known = Object.keys(environments)
    throw new Error(
      `Unknown environment '${environment}'. ` +
        (known.length
          ? `Configured environments: ${known.join(', ')}`
          : `Add environments to pikku.config.json, e.g. { "${environment}": { "backends": { "api": "https://app.example.com/api" } } }`)
    )
  }

  const picked = pickEnvironmentBackend(environment, configured, backend)
  const target = configured.backends[picked]!
  const frontendNames = Object.keys(configured.frontends)
  const fallbackFrontend =
    frontendNames.length === 1
      ? frontendNames[0]
      : primaryFrontend && primaryFrontend in configured.frontends
        ? primaryFrontend
        : undefined
  const resolved: ResolvedEnvironment = {
    backend: picked,
    apiUrl: target.url,
    ...(target.signInPath ? { signInPath: target.signInPath } : {}),
    ...(target.sessionPath ? { sessionPath: target.sessionPath } : {}),
    ...(target.rpcPath ? { rpcPath: target.rpcPath } : {}),
    ...(fallbackFrontend
      ? { appUrl: configured.frontends[fallbackFrontend] }
      : {}),
    ...(frontendNames.length > 0
      ? { appUrls: { ...configured.frontends } }
      : {}),
    ...(configured.production ? { production: true } : {}),
  }

  if (apiUrl !== undefined) {
    const url = assertAbsoluteUrl('--api-url', apiUrl)
    if (spawn && !LOCAL_HOSTNAMES.has(url.hostname)) {
      throw new Error(
        `--spawn starts a server on this machine, but --api-url points at '${url.hostname}'. ` +
          `Drop --spawn to run against an already-serving target, or point --api-url at localhost.`
      )
    }
    resolved.apiUrl = apiUrl
  }

  if (appUrl !== undefined) {
    const { base, byApp } = parseAppUrls(appUrl)
    if (base !== undefined) resolved.appUrl = base
    if (Object.keys(byApp).length > 0) {
      resolved.appUrls = { ...resolved.appUrls, ...byApp }
    }
  }

  return resolved
}

/**
 * `--app-url` as one url, or as `<app>=<url>` pairs, or both.
 *
 *   --app-url https://host/
 *   --app-url workshop=https://host/,storefront=https://host/_frontend/storefront/
 *   --app-url https://host/,storefront=https://host/_frontend/storefront/
 *
 * Comma-separated to match `--flows` and `--tags` rather than taking the flag
 * repeatedly, which the option parser types as a single string. A bare url is
 * the fallback for virtual users naming no app; a pair binds one app.
 */
export const parseAppUrls = (
  value: string
): { base?: string; byApp: Record<string, string> } => {
  const byApp: Record<string, string> = {}
  let base: string | undefined
  for (const raw of value.split(',')) {
    const segment = raw.trim()
    if (!segment) continue
    const pair = /^([a-z0-9][a-z0-9-]*)=(.+)$/i.exec(segment)
    if (!pair) {
      assertAbsoluteUrl('--app-url', segment)
      base = segment
      continue
    }
    const [, app, url] = pair as unknown as [string, string, string]
    assertAbsoluteUrl(`--app-url ${app}`, url)
    byApp[app] = url
  }
  return { base, byApp }
}

/**
 * The environment name `pikku dev` is running as, for anything that gates on
 * `PIKKU_ENV` — virtual user provisioning above all, which fails closed and so
 * provisions nothing at all when nobody says where the process is.
 *
 * Local means a configured, non-production environment whose backends are all
 * loopback hosts; `local` wins when several qualify. A project that configures
 * none gets `undefined` rather than a guess.
 */
export const resolveDevEnvironmentName = (
  environments: Record<string, PikkuEnvironment>
): string | undefined => {
  const candidates = Object.entries(environments).filter(([, environment]) => {
    if (environment.production) {
      return false
    }
    const urls = Object.values(environment.backends).map((b) => b.url)
    try {
      return (
        urls.length > 0 &&
        urls.every((url) => LOCAL_HOSTNAMES.has(new URL(url).hostname))
      )
    } catch {
      return false
    }
  })
  const preferred = candidates.find(([name]) => name === 'local')
  return (preferred ?? candidates[0])?.[0]
}

/** The port `pikku dev` binds when neither `--port` nor a local environment names one. */
export const DEFAULT_DEV_PORT = 3000

/**
 * The port an `apiUrl` is served on: its explicit port, else its scheme's
 * default (80 for http, 443 for https).
 */
export const apiUrlPort = (apiUrl: string): number => {
  const url = new URL(apiUrl)
  if (url.port) return Number(url.port)
  return url.protocol === 'https:' ? 443 : 80
}

/**
 * The port `pikku dev` binds.
 *
 * An explicit `--port` wins. Otherwise the local environment's first backend URL says it:
 * that URL is what scenarios, virtual users and the frontend's proxy call, so a
 * server on any other port is one they cannot reach. A project with no local
 * environment gets {@link DEFAULT_DEV_PORT}.
 */
export const resolveDevPort = (
  explicitPort: string | undefined,
  environments: Record<string, PikkuEnvironment>
): number => {
  if (explicitPort !== undefined && explicitPort !== '') {
    const port = Number(explicitPort)
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(
        `--port ${explicitPort} is not a port number (0-65535; 0 picks a free one)`
      )
    }
    return port
  }
  const name = resolveDevEnvironmentName(environments)
  if (!name) return DEFAULT_DEV_PORT
  const [first] = Object.values(environments[name]!.backends)
  return first ? apiUrlPort(first.url) : DEFAULT_DEV_PORT
}
