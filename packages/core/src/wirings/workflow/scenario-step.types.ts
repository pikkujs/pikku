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
 * The `scenarioStep` wire, present on every scenario step invocation.
 */
export interface PikkuScenarioStepWire {
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
  actor?: any
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
 * Supplied by `@pikku/playwright` (or any other driver) and consumed by the
 * scenario runner. Declared here so the CLI depends only on core.
 */
export interface ScenarioBrowserProvider {
  /** Resolve — creating on first use — the browser session for an actor. */
  sessionFor(actorName: string): Promise<PikkuBrowserWire>
  close(): Promise<void>
}
