/**
 * Resolving `pikku scenario run <environment>` to the URLs the run targets.
 *
 * The configured environment is the base; `--api-url`/`--app-url` override it
 * for one invocation, which is what makes a suite runnable against a target
 * that only exists at run time (a freshly provisioned sandbox) without writing
 * a pikku.config.json per deployment.
 */

/** One entry of `scenarios.environments` in pikku.config.json. */
export interface ScenarioEnvironment {
  apiUrl: string
  signInPath?: string
  rpcPath?: string
  appUrl?: string
}

export interface ResolveScenarioEnvironmentOptions {
  /** The name given on the command line. Must exist in config. */
  environment: string
  environments: Record<string, ScenarioEnvironment>
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
export const resolveScenarioEnvironment = ({
  environment,
  environments,
  apiUrl,
  appUrl,
  spawn = false,
}: ResolveScenarioEnvironmentOptions): ScenarioEnvironment => {
  const configured = environments[environment]
  if (!configured) {
    const known = Object.keys(environments)
    throw new Error(
      `Unknown scenario environment '${environment}'. ` +
        (known.length
          ? `Configured environments: ${known.join(', ')}`
          : `Add scenarios.environments to pikku.config.json, e.g. { "${environment}": { "apiUrl": "https://app.example.com/api" } }`)
    )
  }

  const resolved: ScenarioEnvironment = { ...configured }

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
    assertAbsoluteUrl('--app-url', appUrl)
    resolved.appUrl = appUrl
  }

  return resolved
}
