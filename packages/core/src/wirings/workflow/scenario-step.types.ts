import type { ScenarioPersona } from '../../services/personas-service.js'
import type { ScenarioArtifact } from './scenario-run.types.js'

/**
 * Scenario steps: named, typed units of scenario behaviour.
 *
 * A step's body is an ordinary pikku function, so it may drive a browser, call
 * an RPC as its actor, or run a workflow. `given` and `when` differ only in the
 * prose the reporter renders; `then` also changes what runs, because its
 * bindings are witnesses — every declared surface is observed and the
 * observations must agree. See {@link ScenarioSurfaceResolution}.
 */

/**
 * Which Gherkin-style keyword the reporter prefixes this step with.
 *
 * Every step takes one. A scenario is read by people deciding whether it
 * describes the behaviour they wanted, and a step that says only what it does
 * without saying whether it is setup, action or claim is the one nobody can
 * check — which is also why PKU680 can tell a scenario that never asserts.
 */
export type ScenarioStepPhase = 'given' | 'when' | 'then'

/**
 * Who acts in a step.
 *
 * `persona` is a person driving the system through one of its surfaces — the
 * ordinary `pikkuScenarioStep`. `platform` is the app acting on itself ("the
 * platform has expired the trial"), and `addon` is a third-party system acting
 * on it ("Stripe's webhook arrives"), contributed by the addon that wraps that
 * service.
 *
 * The three are separate declarations rather than a field on one, so the
 * inspector verifies a step's kind by which function was called rather than by
 * trusting a string literal — and so an addon package exports only addon steps,
 * which is checkable.
 */
export type ScenarioStepKind = 'persona' | 'platform' | 'addon'

/**
 * How an actor drives the system for one step.
 *
 * A step declares one implementation per surface it supports, and the runner
 * picks between them — so the same ladder can run through a real browser, over
 * the websocket, or entirely server-side.
 *
 * `default` is the floor: it is what every other surface falls back to, so it
 * can never itself fall back.
 */
export type ScenarioSurface = 'browser' | 'cli' | 'default'

export const SCENARIO_SURFACES: readonly ScenarioSurface[] = [
  'browser',
  'cli',
  'default',
]

/**
 * How a step's declared surfaces resolve for one run.
 *
 * `given`/`when` bindings are **alternatives** — clicking Buy and calling
 * `createOrder` are two ways to cause one effect, so exactly one runs.
 *
 * `then` bindings are **witnesses** — "the order row says paid" and "the
 * confirmation panel says paid" are different claims that share a name, and the
 * gap between them is the bug nobody catches. So every declared witness runs and
 * they must agree.
 */
export type ScenarioSurfaceResolution =
  | {
      kind: 'action'
      surface: ScenarioSurface
      /** The run asked for a surface this step does not implement. */
      fellBack: boolean
    }
  | {
      kind: 'witness'
      /**
       * Every witness to run, surface first. Empty means the assertion has no
       * binding this run can execute at all — nothing would check anything, so
       * the step fails rather than reporting a pass it never earned.
       */
      surfaces: ScenarioSurface[]
      /**
       * Something checked the assertion, but not on the surface its prose
       * claims — so nobody looked at the UI. Reported as its own state and
       * counted against coverage: not being in the UI *is* the finding.
       *
       * Disjoint from an empty `surfaces`; an assertion that ran nowhere is a
       * failure, not a coverage statistic.
       */
      unwitnessed: boolean
    }

/**
 * Options accepted by `scenario.given/when/then`.
 *
 * Note the retry default differs from an ordinary workflow step: retrying a
 * failed assertion is the wrong behaviour for a test primitive, so steps
 * default to no retries.
 */
export interface ScenarioStepOptions {
  /** The actor this step runs as. Required for steps declaring a `browser` binding. */
  actor?: unknown
  /** Overrides the step's own `description` for this call site only. */
  description?: string
  /** Defaults to 0 for steps — a failed assertion must not be retried. */
  retries?: number
  retryDelay?: number | string
}

/**
 * The environment a scenario run targets, as declared in pikku.config.json
 * under `environments`.
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
 * actors can actually call. It defaults to the open `ScenarioPersona` for a
 * project that declares no registry.
 */
export interface PikkuScenarioStepWire<TActor = ScenarioPersona> {
  /** Registered step name (also its pikkuFuncId) */
  name: string
  /** Durable key within the run; may carry an `#ordinal` suffix when repeated */
  stepName: string
  runId: string
  phase: ScenarioStepPhase
  /**
   * Which of the step's bindings is currently executing. A `then` step runs once
   * per witness, so its body sees this change between invocations.
   */
  surface: ScenarioSurface
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
 * How a browser step names an element.
 *
 * A `data-testid` on its own is rarely enough to name exactly one: `where`
 * matches the element's own data attributes (so a step asserts a status
 * without reading translated copy back to the app), `prefix` matches a family
 * of ids, `containing` picks the match holding a piece of text, and `within`
 * scopes the lookup to one row or section.
 *
 * Declared here so a step's input type is structural; the driver
 * (`@pikku/playwright`) is what resolves it against a real page.
 */
export interface TestIdSelector {
  testId: string
  /** Match every test id beginning with `testId`, e.g. every `flow-card-*`. */
  prefix?: boolean
  /** Data attributes the element must also carry, e.g. `{ 'data-open': 'true' }`. */
  where?: Record<string, string>
  /** Narrow to the one match holding this text. */
  containing?: string
  /** Scope the lookup to one enclosing element, e.g. the row for one user. */
  within?: TestIdSelector
}

/**
 * Structural browser handle, present only when the runner provisioned a
 * browser for this step (a `browser` binding on the step config).
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
   * Name the scenario about to run, so anything it captures is filed under it.
   *
   * Called before each scenario. A provider that is never told has to fall
   * back to one shared label, which puts every run's artifacts in a single
   * folder — findable only by timestamp.
   */
  beginScenario?(scenario: string): void
  /**
   * Report how the scenario that just ran finished.
   *
   * Called after each scenario, and separate from `reset()` because artifacts
   * that only exist once a window closes — a video — are produced by the NEXT
   * scenario's reset, long after the outcome that decides whether to keep them.
   */
  endScenario?(outcome: 'passed' | 'failed'): void
  /**
   * Snapshot every open window for a failed scenario. `label` identifies the
   * scenario in artifact filenames. Never throws: a failure to capture must
   * not replace the failure being captured.
   */
  captureFailure?(label: string): Promise<ScenarioBrowserFailure[]>
  /**
   * Everything the run filed, each entry naming the scenario it belongs to.
   *
   * Reported by the driver rather than discovered by scanning the directory:
   * only the driver knows which window produced a file and under what caption,
   * and a video's final name is not settled until the run closes. Read after
   * `close()`, which is the first moment the answer is complete.
   */
  artifacts?(): ScenarioArtifact[]
  close(): Promise<void>
}
