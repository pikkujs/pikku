/**
 * The scenario runner's browser lifecycle.
 *
 * Two jobs, both kept out of the run loop so they are testable without
 * launching a browser: deciding whether a run needs a driver at all (and
 * failing early, with instructions, when it does and cannot have one), and
 * making the driver's optional isolation and diagnostics safe to call
 * unconditionally.
 */
import type {
  ScenarioArtifact,
  ScenarioBrowserFailure,
  ScenarioBrowserProvider,
} from '@pikku/core/scenario'
import type { ResolvedPersona } from '@pikku/core/services'

/** The default driver, used when a project names no other. */
export const DEFAULT_BROWSER_DRIVER = '@pikku/playwright'

export interface ScenarioBrowserDriverOptions {
  secret: string
  actors: Record<string, ResolvedPersona>
  signInPath?: string
  capture?: ScenarioCaptureOptions
  config: unknown
}

/**
 * What a browser driver package exports.
 *
 * Nothing here is playwright-specific: a driver is anything that can hand a
 * scenario step a `ScenarioBrowserProvider`. `@pikku/playwright` is the one
 * pikku ships, named by `scenarios.browserDriver` only as a default.
 */
export interface ScenarioBrowserDriver {
  createScenarioBrowserProvider?: (
    options: ScenarioBrowserDriverOptions
  ) => ScenarioBrowserProvider
  /** The class form the bundled driver exports. */
  PlaywrightScenarioBrowserProvider?: new (
    options: ScenarioBrowserDriverOptions
  ) => ScenarioBrowserProvider
  /**
   * Driver-specific config (headed, slowMo, timeouts) resolved from the env.
   *
   * A driver may resolve `appUrl` itself when the caller passes none — that is
   * how a target known only at run time (a sandbox hostname in the env) is
   * reached without a config file per deployment. A driver that answers with a
   * placeholder rather than a real target must say so with
   * `appUrlSource: 'default'`, which the runner reports as a missing appUrl.
   */
  browserConfigFromEnv?: (overrides: {
    appUrl?: string
    appUrls?: Record<string, string>
    apiUrl: string
  }) => unknown
}

/**
 * Artifacts a run may produce. Mirrors the driver's own CaptureOptions rather
 * than importing it: the CLI must not depend on a driver package it resolves
 * dynamically, and this shape is the contract between them.
 */
export interface ScenarioCaptureOptions {
  /** Root directory for the run's artifacts. */
  dir: string
  /** The invocation these artifacts belong to. */
  runId: string
  /** Write the screenshots a scenario asks for by name. */
  screenshots?: boolean
  /** Which scenarios keep their recording. */
  video?: 'off' | 'failed' | 'all'
  /** Re-encode with ffmpeg when available. Defaults on — the footage is nearly static. */
  compress?: boolean
}

export interface ResolveScenarioBrowserProviderOptions {
  /** The environment name, for error messages that tell the user what to edit. */
  environment: string
  apiUrl: string
  appUrl?: string
  /** Base url per app, for a product whose personas sign into more than one. */
  appUrls?: Record<string, string>
  secret: string
  actors: Record<string, ResolvedPersona>
  signInPath?: string
  /**
   * Artifacts for this run — named screenshots, failure screenshots, and a
   * video per scenario kept according to its retention. Undefined leaves
   * capture off entirely, which is what a driver used outside
   * `pikku scenario run` gets.
   */
  capture?: ScenarioCaptureOptions
  /** The scenarios that declared browser steps, named in the missing-driver error. */
  browserScenarios: string[]
  /** Package to drive the browser. Defaults to `@pikku/playwright`. */
  driver?: string
  importDriver?: (specifier: string) => Promise<ScenarioBrowserDriver>
}

/**
 * What the driver answered with, once it has had its say about `appUrl`.
 * `appUrlSource` is optional: a driver that resolves a URL and does not
 * classify it is taken at its word.
 */
interface ResolvedBrowserConfig {
  appUrl?: string
  appUrls?: Record<string, string>
  appUrlSource?: 'override' | 'env' | 'default'
}

/**
 * Both failure modes here are discovered before the first scenario starts. A
 * missing `appUrl` or an uninstalled driver found mid-run costs a whole run to
 * learn about.
 *
 * `appUrl` is checked after the driver has resolved its config rather than
 * before, so a driver that knows the target from its own environment (a
 * sandbox hostname) is allowed to supply it. The check is not dropped: a driver
 * reporting `appUrlSource: 'default'` resolved nothing and fails the same way,
 * because a run against a placeholder URL is worse than one that refuses to
 * start.
 */
export const resolveScenarioBrowserProvider = async ({
  environment,
  apiUrl,
  appUrl,
  appUrls,
  secret,
  actors,
  signInPath,
  capture,
  browserScenarios,
  driver = DEFAULT_BROWSER_DRIVER,
  importDriver = (specifier) =>
    import(specifier) as unknown as Promise<ScenarioBrowserDriver>,
}: ResolveScenarioBrowserProviderOptions): Promise<ScenarioBrowserProvider> => {
  const module = await importDriver(driver).catch(() => {
    const install =
      driver === DEFAULT_BROWSER_DRIVER
        ? `Run 'yarn add -D ${driver} @playwright/test'`
        : `Install '${driver}', or point scenarios.browserDriver at a package that is`
    throw new Error(
      `Scenarios ${browserScenarios.join(', ')} declare browser steps but '${driver}' could not be loaded. ` +
        `${install}, or run with --no-browser to skip them.`
    )
  })
  const overrides = { appUrl, apiUrl, ...(appUrls ? { appUrls } : {}) }
  const config = (module.browserConfigFromEnv?.(overrides) ??
    overrides) as ResolvedBrowserConfig
  if (!config.appUrl || config.appUrlSource === 'default') {
    throw new Error(
      `Scenario environment '${environment}' has browser steps but no 'appUrl', and '${driver}' resolved none from the environment. ` +
        `Add it to environments.${environment} in pikku.config.json, pass --app-url for a target that only exists at run time, or run with --no-browser to skip them.`
    )
  }

  // An actor whose app has no url would browse the fallback: the wrong app's
  // pages, loading fine, asserting nothing about the app the scenario meant.
  // Cheaper to refuse now than to read a green run that proved one app twice.
  const unmapped = [
    ...new Set(
      Object.values(actors)
        .map((persona) => persona.app)
        .filter((app): app is string => !!app && !config.appUrls?.[app])
    ),
  ]
  if (unmapped.length > 0 && Object.keys(config.appUrls ?? {}).length > 0) {
    throw new Error(
      `No app url for ${unmapped.map((app) => `'${app}'`).join(', ')}, which ${unmapped.length > 1 ? 'personas sign' : 'a persona signs'} into. ` +
        `Pass --app-url ${unmapped[0]}=<url> (repeatable, comma-separated) or add it to environments.${environment}.appUrls in pikku.config.json.`
    )
  }
  const options: ScenarioBrowserDriverOptions = {
    secret,
    actors,
    signInPath,
    capture,
    config,
  }
  if (module.createScenarioBrowserProvider) {
    return module.createScenarioBrowserProvider(options)
  }
  if (module.PlaywrightScenarioBrowserProvider) {
    return new module.PlaywrightScenarioBrowserProvider(options)
  }
  throw new Error(
    `'${driver}' is not a scenario browser driver: it exports neither ` +
      `'createScenarioBrowserProvider' nor a provider class. A driver returns an object with ` +
      `sessionFor() and close(), and optionally reset() and captureFailure().`
  )
}

/**
 * The calls the run loop makes, safe against a run with no browser and against
 * a driver that implements none of the optional members.
 */
export interface ScenarioBrowserLifecycle {
  reset(): Promise<void>
  beginScenario(scenario: string): void
  endScenario(outcome: 'passed' | 'failed'): void
  captureFailure(label: string): Promise<ScenarioBrowserFailure[]>
  /** What the run filed, complete only once `close()` has been called. */
  artifacts(): ScenarioArtifact[]
  close(): Promise<void>
}

export const scenarioBrowserLifecycle = (
  provider: ScenarioBrowserProvider | undefined
): ScenarioBrowserLifecycle => ({
  // Deliberately NOT swallowed: a browser that cannot be reset would run the
  // next scenario against the last one's session, and a scenario failing on
  // its reset is far easier to diagnose than one failing on stale state.
  reset: async () => {
    await provider?.reset?.()
  },
  beginScenario: (scenario) => {
    provider?.beginScenario?.(scenario)
  },
  endScenario: (outcome) => {
    provider?.endScenario?.(outcome)
  },
  captureFailure: async (label) => {
    try {
      return (await provider?.captureFailure?.(label)) ?? []
    } catch {
      // This runs while a scenario is already failing. Whatever went wrong
      // here matters less than the error we were called to describe.
      return []
    }
  },
  artifacts: () => provider?.artifacts?.() ?? [],
  close: async () => {
    await provider?.close()
  },
})
