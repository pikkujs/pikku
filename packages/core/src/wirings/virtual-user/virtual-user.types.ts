import type { ScenarioHttpResponse } from '../../services/scenario-actors-service.js'
import type { ActorFlowVerdict } from '../actor-flow/actor-flow.types.js'
import type { VirtualUserTuning } from './virtual-user-dispositions.js'

/**
 * How a virtual user behaves, mechanically. A disposition changes the loop, the
 * input generation, the memory and the oracle — anything that only changes how
 * the user *talks* is persona prose (`ScenarioActorConfig.personality`) and does
 * not belong here.
 *
 * - `realistic` — schema-first, goal-directed, plausible values (default).
 * - `careless` — repeats, abandons, double-submits, boundary values.
 * - `newcomer` — starts with empty memory and must discover everything.
 * - `stale` — seeded from an earlier run's ids, some no longer valid.
 * - `auditor` — pursues no goal; reads one truth from several places and compares.
 * - `adversarial` — probes authorization and tenancy; a 2xx can be the finding.
 */
export type VirtualUserDisposition =
  | 'realistic'
  | 'careless'
  | 'newcomer'
  | 'stale'
  | 'auditor'
  | 'adversarial'

/**
 * Hard caps the engine enforces itself. Anything the engine cannot count —
 * money above all — belongs in {@link RunVirtualUserParams.stop} instead.
 */
export interface VirtualUserBudget {
  /** Model turns, including ones that produced no call. */
  steps?: number
  /** Non-read RPC calls. */
  mutations?: number
  /** Wall clock, as ms or a duration string (`'30m'`). */
  duration?: number | string
}

/**
 * The running count handed to {@link RunVirtualUserParams.stop}. Pikku collects
 * it because only the engine sees every step; what it is *worth* is the app's,
 * which is why no price or currency appears anywhere in core.
 */
export interface VirtualUserTally {
  steps: number
  calls: number
  mutations: number
  tokensIn: number
  tokensOut: number
  model: string
  elapsedMs: number
  findings: number
}

/**
 * One RPC as the virtual user sees it before reading its schema: enough to
 * choose from, not enough to call with. The whole catalogue goes in the prompt,
 * so this stays deliberately compact — a project with 430 RPCs renders to
 * roughly 8k tokens, which is cheaper than any retrieval step and hides nothing.
 */
export interface ApiCatalogueEntry {
  name: string
  /** Top-level input property names, for choosing between similar endpoints. */
  inputKeys?: readonly string[]
  /** Top-level output property names. */
  outputKeys?: readonly string[]
  description?: string
  /**
   * Whether the call only reads. `undefined` means nobody annotated it — which
   * is not the same as safe, so the engine falls back to a name heuristic and
   * reports how many entries it had to guess at.
   */
  readonly?: boolean
  /** Declared by the app as needing a human's approval — denied by default. */
  approvalRequired?: boolean
  /** Permission gate names, used to narrow a large catalogue by actor tier. */
  permissions?: readonly string[]
  tags?: readonly string[]
  /** JSON schema returned by `describe`, before the user may call. */
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

/**
 * Where an intent comes from: a feature or scenario in the app's own words.
 *
 * Deliberately prose. The virtual user never receives the scenario's step graph
 * — no rpc names, no `$ref` dataflow — because finding the API itself is the
 * behaviour under test, and those graphs are a build-time artifact that no
 * deployed stage carries.
 */
export interface IntentSource {
  id: string
  title: string
  description?: string
  /** Step prose, as a person would be told it. Never rpc names. */
  steps?: readonly string[]
  tags?: readonly string[]
  /** Actor names this intent is available to. Empty means everyone. */
  actors?: readonly string[]
}

/** Why the engine flagged something. */
export type VirtualUserFindingKind =
  | 'server-error'
  | 'transport-error'
  | 'schema-violation'
  | 'unexpected-success'
  | 'custom'

/** Something worth a human's attention, found while imitating a user. */
export interface VirtualUserFinding {
  kind: VirtualUserFindingKind
  detail: string
  rpcName?: string
  status?: number
  intentId?: string
  /** Step index within the run, so the transcript can be replayed to here. */
  step: number
}

/**
 * The transport the virtual user acts through. HTTP in production (an
 * `HttpScenarioActor`), but the engine only sees this contract — which is what
 * lets the whole loop be tested without a network.
 */
export interface VirtualUserTarget {
  /** Invoke an RPC as this user, reporting the status as data rather than throwing. */
  call(rpcName: string, args: unknown): Promise<ScenarioHttpResponse>
  /** Converse with an AI agent in persona. Omitted by apps that have no agents. */
  talkTo?(agent: string, task: string): Promise<ActorFlowVerdict>
  /** Send a fixture file. Omitted by apps with no upload surface. */
  upload?(file: string): Promise<ScenarioHttpResponse>
}

/** What the model chose to do this turn. */
export type VirtualUserAction =
  | { kind: 'describe'; rpcName: string }
  | { kind: 'call'; rpcName: string; args?: unknown }
  | { kind: 'talkTo'; agent: string; task: string }
  | { kind: 'upload'; file: string }
  | { kind: 'complete'; summary?: string }
  | { kind: 'stuck'; reason?: string }

/** How an intent ended, or that it has not. */
export type IntentStatus =
  | 'open'
  | 'suspended'
  | 'completed'
  | 'abandoned'
  | 'stuck'

/** One intent's life within a run. */
export interface IntentRecord {
  id: string
  sourceId: string
  title: string
  status: IntentStatus
  /** Step indices at which this intent was the active one. */
  steps: number[]
  /** How many times it was put down and picked back up. */
  suspensions: number
  summary?: string
}

/** One turn: what the engine scheduled, what the model did, what came back. */
export interface StepRecord {
  index: number
  intentId?: string
  action: VirtualUserAction | { kind: 'invalid'; detail: string }
  status?: number
  ok?: boolean
  /** Truncated response text, so a run record stays readable. */
  response?: string
  findingKinds?: VirtualUserFindingKind[]
  tokensIn: number
  tokensOut: number
}

/**
 * A declared virtual user, as the console and the CLI read it.
 *
 * A `pikkuVirtualUser` config is entirely literal — an actor name, a
 * disposition, some goals — so unlike a feature there is no code body and
 * nothing to resolve at runtime. That is why this is generated straight to
 * `scenarios/virtual-users.gen.json` and read off disk: describing, listing or
 * running one never has to load the app.
 */
export interface VirtualUserMeta {
  /** The export identifier. */
  id: string
  name: string
  description?: string
  /** Which scenario actor it signs in as. */
  actor: string
  disposition: VirtualUserDisposition
  /**
   * Overrides for that disposition's dials. The six profiles are defaults, so a
   * product that knows its users repeat themselves more than `careless` assumes
   * says so here rather than inventing a seventh disposition.
   */
  tuning?: VirtualUserTuning
  /** What it wants, beyond whatever scenarios name its actor. */
  goals: string[]
  tags: string[]
  budget?: VirtualUserBudget
  /**
   * Permission-function names this actor genuinely holds. Withheld from an
   * `adversarial` user's catalogue but still its oracle: a 2xx from an endpoint
   * outside this list is the finding.
   */
  grants?: string[]
  /** Whether approval-gated endpoints are on the table. Off by default. */
  allowApprovalRequired?: boolean
  /** Fixture paths it may upload, relative to the project root. */
  fixtures?: string[]
}

export type VirtualUsersMeta = Record<string, VirtualUserMeta>

/** Everything a run produced. Seeded, so it replays. */
export interface VirtualUserRunResult {
  seed: number
  tally: VirtualUserTally
  findings: VirtualUserFinding[]
  intents: IntentRecord[]
  steps: StepRecord[]
  /** Ids and slugs the user saw, for seeding a later `stale` run. */
  memory: Record<string, string>
  /** Why the run ended. */
  stoppedBy:
    | 'no-intents'
    | 'budget-steps'
    | 'budget-mutations'
    | 'budget-duration'
    | 'stop-hook'
    | 'exhausted'
}
