/**
 * Resolving `pikku scenario run <environment>` and `pikku persona run
 * <environment>` to the URLs the run targets.
 *
 * The configured environment is the base; `--api-url`/`--app-url` override it
 * for one invocation, which is what makes a suite runnable against a target
 * that only exists at run time (a freshly provisioned sandbox) without writing
 * a pikku.config.json per deployment.
 */

/** One entry of `environments` in pikku.config.json. */
export interface PikkuEnvironment {
  apiUrl: string
  signInPath?: string
  /**
   * Where the session and its roles are read back, for a stage that reports
   * them somewhere other than `get-session` under the sign-in path's own mount.
   */
  sessionPath?: string
  rpcPath?: string
  appUrl?: string
  /**
   * Where each app is served, keyed by the `app` its personas declare.
   *
   * A product can be more than one frontend — staff in one, customers in
   * another — and the two are usually different paths on one host. A browser
   * step navigates as its actor, so the actor's app decides which of these it
   * navigates against, and `appUrl` is the fallback for a persona that names
   * no app. Without this a run has one base for everybody: whichever app owns
   * it is proved twice and the other never, silently, because both sets of
   * paths resolve against the wrong app and load.
   */
  appUrls?: Record<string, string>
  /** Real consequences: only an `accountable` persona may run against it. */
  production?: boolean
}

export interface ResolveEnvironmentOptions {
  /** The name given on the command line. Must exist in config. */
  environment: string
  environments: Record<string, PikkuEnvironment>
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
 * Applied once, so actors, step env, the browser driver and the spawned server
 * all see the same target. The environment is still looked up by name: the
 * flags override fields on a configured environment, they do not invent one.
 */
export const resolveEnvironment = ({
  environment,
  environments,
  apiUrl,
  appUrl,
  spawn = false,
}: ResolveEnvironmentOptions): PikkuEnvironment => {
  const configured = environments[environment]
  if (!configured) {
    const known = Object.keys(environments)
    throw new Error(
      `Unknown environment '${environment}'. ` +
        (known.length
          ? `Configured environments: ${known.join(', ')}`
          : `Add environments to pikku.config.json, e.g. { "${environment}": { "apiUrl": "https://app.example.com/api" } }`)
    )
  }

  const resolved: PikkuEnvironment = { ...configured }

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
 * the fallback for personas naming no app; a pair binds one app.
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
 * `PIKKU_ENV` — persona provisioning above all, which fails closed and so
 * provisions nothing at all when nobody says where the process is.
 *
 * Local means a configured, non-production environment whose `apiUrl` is a
 * loopback host; `local` wins when several qualify. A project that configures
 * none gets `undefined` rather than a guess.
 */
export const resolveDevEnvironmentName = (
  environments: Record<string, PikkuEnvironment>
): string | undefined => {
  const candidates = Object.entries(environments).filter(([, environment]) => {
    if (environment.production) {
      return false
    }
    try {
      return LOCAL_HOSTNAMES.has(new URL(environment.apiUrl).hostname)
    } catch {
      return false
    }
  })
  const preferred = candidates.find(([name]) => name === 'local')
  return (preferred ?? candidates[0])?.[0]
}
