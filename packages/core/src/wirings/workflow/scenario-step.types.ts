import type { ScenarioActor } from '../../services/scenario-actors-service.js'

/**
 * Scenario steps: named, typed units of scenario behaviour.
 *
 * A step's body is an ordinary pikku function, so it may drive a browser, call
 * an RPC as its actor, or run a workflow. `given`/`when`/`then` are sugar over
 * `step` — they only change the prose the reporter renders.
 */

/**
 * Which Gherkin-style keyword the reporter prefixes this step with. `step`
 * renders no prefix at all.
 */
export type ScenarioStepPhase = 'step' | 'given' | 'when' | 'then'

/**
 * Options accepted by `scenario.step/given/when/then`.
 *
 * Note the retry default differs from an ordinary workflow step: retrying a
 * failed assertion is the wrong behaviour for a test primitive, so steps
 * default to no retries.
 */
export interface ScenarioStepOptions {
  /** The actor this step runs as. Required for steps declaring `browser: true`. */
  actor?: unknown
  /** Overrides the step's own `description` for this call site only. */
  description?: string
  /** Defaults to 0 for steps — a failed assertion must not be retried. */
  retries?: number
  retryDelay?: number | string
}

/**
 * The environment a scenario run targets, as declared in pikku.config.json
 * under `scenarios.environments`.
 */
export interface ScenarioEnvironment {
  /** Base API URL of the target app, INCLUDING the HTTP prefix. */
  apiUrl: string
  /** Base URL of the app's UI, for environments with browser steps. */
  appUrl?: string
}

/**
 * The `scenarioStep` wire, present on every scenario step invocation.
 *
 * `TActor` is the project's own actor type, so a step reaches only the RPCs its
 * actors can actually call. It defaults to the open `ScenarioActor` for a
 * project that declares no registry.
 */
export interface PikkuScenarioStepWire<TActor = ScenarioActor> {
  /** Registered step name (also its pikkuFuncId) */
  name: string
  /** Durable key within the run; may carry an `#ordinal` suffix when repeated */
  stepName: string
  runId: string
  phase: ScenarioStepPhase
  /**
   * The actor this step runs as, when one was given. Call RPCs through it
   * (`actor.invoke(...)`) so they run against the target environment as that
   * persona.
   */
  actor?: TActor
  /**
   * The environment this run targets. A step runs in the CLI process, where
   * there is no `variables` service — this is how a raw-HTTP step learns the
   * target's URL without reaching for `process.env`.
   */
  env?: ScenarioEnvironment
}

/**
 * Structural browser handle, present only when the runner provisioned a
 * browser for this step (`browser: true` on the step config).
 *
 * `@pikku/core` deliberately never imports playwright — it must stay
 * dependency-free for edge runtimes. `@pikku/playwright` augments this
 * interface via `declare module`, so `wire.browser.page` is a fully typed
 * Playwright `Page` in a project that installs it.
 */
export interface PikkuBrowserWire {
  /** The actor whose browser context this is */
  readonly actor: string
  goto(url: string): Promise<void>
  screenshot(name?: string): Promise<Uint8Array>
}

/**
 * What one actor's window looked like at the moment a scenario failed.
 *
 * A browser step fails with a selector timeout that says nothing about *why*
 * the page never rendered. The answer is almost always in the page's own
 * errors, which the driver has been collecting all along.
 */
export interface ScenarioBrowserFailure {
  /** The actor whose window this is. */
  actor: string
  /** Where the window was pointed, when the driver can still report it. */
  url?: string
  /** Path the screenshot was written to; absent when none could be taken. */
  screenshot?: string
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
  apiErrors: string[]
}

/**
 * Supplied by `@pikku/playwright` (or any other driver) and consumed by the
 * scenario runner. Declared here so the CLI depends only on core.
 *
 * `reset` and `captureFailure` are optional so a driver written against an
 * earlier version keeps compiling; the runner treats a driver without them as
 * one that simply offers no isolation and no diagnostics.
 */
export interface ScenarioBrowserProvider {
  /** Resolve — creating on first use — the browser session for an actor. */
  sessionFor(actorName: string): Promise<PikkuBrowserWire>
  /**
   * Discard every actor's per-scenario state — cookies, storage, open pages —
   * while keeping the browser itself. Called between scenarios, so one
   * scenario cannot leave the next signed in as somebody else.
   */
  reset?(): Promise<void>
  /**
   * Snapshot every open window for a failed scenario. `label` identifies the
   * scenario in artifact filenames. Never throws: a failure to capture must
   * not replace the failure being captured.
   */
  captureFailure?(label: string): Promise<ScenarioBrowserFailure[]>
  close(): Promise<void>
}
