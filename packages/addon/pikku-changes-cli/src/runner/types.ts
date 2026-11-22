/**
 * The changes runner keeps agents building the local changes queue, one per
 * changeset worktree. It knows nothing about models or harnesses: an agent is
 * whatever an {@link AgentLauncher} starts, and every git, CLI and shell call
 * goes through {@link RunnerCommands}, so a test can fake either side.
 */

/** What an agent is started for: a change in its worktree, a red main checkout, or a merge conflict. */
export type AgentKind = 'build' | 'repair' | 'conflict'

/** The change a build agent works, or null for an agent in the main checkout. */
export interface AgentChange {
  id: string
  title: string
  groupId: string
  worktree: string
  /** The specialist the change is filed for, when the queue names one. */
  specialist?: string | null
}

export interface AgentStart {
  cwd: string
  /** Added to the runner's own environment; the launcher passes it to the agent. */
  env: Record<string, string>
  prompt: string
  change: AgentChange | null
  kind: AgentKind
  /** The specialist of the change (else of the route) when known, so a launcher can pick a model without asking the queue again. */
  specialist: string | null
  /** The `pikku changes next` route the agent was started from; null for a repair. */
  route: NextRoute | null
}

/**
 * Anything the agent does: output, or a tool starting or ending. The stall
 * watchdog stops an agent that is quiet with no tool running, and one whose
 * oldest running tool has run too long. A launcher that cannot see tools
 * reports `output` only.
 */
export type AgentActivity =
  | { type: 'output' }
  | { type: 'tool_start'; id: string }
  | { type: 'tool_end'; id: string }

export interface AgentExit {
  code: number | null
  signal: string | null
}

export interface AgentRun {
  /** Stops the agent and whatever it started. Safe to call more than once and after it ended. */
  stop(): void
  onActivity(listener: (activity: AgentActivity) => void): () => void
  /** Called once when the agent has ended, however it ended (also when it had already ended). */
  onExit(listener: (exit: AgentExit) => void): () => void
}

export interface AgentLauncher {
  start(start: AgentStart): AgentRun | Promise<AgentRun>
}

export interface CommandResult {
  code: number
  output: string
}

/** Every process the runner itself runs. */
export interface RunnerCommands {
  /** The pikku CLI, in `cwd`. */
  pikku(
    cwd: string,
    args: string[],
    env?: Record<string, string>
  ): Promise<CommandResult>
  git(cwd: string, args: string[]): Promise<CommandResult>
  /** A shell command (setup, check), stopped after `seconds`. */
  shell(cwd: string, command: string, seconds: number): Promise<CommandResult>
}

/**
 * One line of what the runner did. `level: 'error'` is something a person has
 * to act on; `kind` names the event for a program reading it.
 */
export interface RunnerEvent {
  level: 'info' | 'error'
  kind: RunnerEventKind
  text: string
  change?: string
}

export type RunnerEventKind =
  | 'self-check'
  | 'merged'
  | 'claimed'
  | 'not-claimed'
  | 'prepare-failed'
  | 'started'
  | 'ended'
  | 'release-failed'
  | 'abandoned'
  | 'stalled'
  | 'red'
  | 'green'
  | 'repair'
  | 'conflict'
  | 'gave-up'
  | 'limit'
  | 'stopped'
  | 'idle'
  | 'stepped'
  | 'failed'
  | 'note'

/** A local pikku CLI build that worktrees are pointed at: `bin` is its dist/bin/pikku.js, `checkout` the pikku repo it was built in. */
export interface LocalCli {
  bin: string
  checkout: string
  /** More @pikku packages to relink than the CLI's own, with what they depend on. */
  relinkExtra?: string[]
  /** Dependencies whose project copies point at the one the local @pikku/kysely uses (default kysely). */
  dedupe?: string[]
}

export interface PromptContext {
  route: NextRoute
  change: AgentChange
  /** The specialist of the change (else of the route) when known. */
  specialist: string | null
  claimant: string
  leaseMinutes: number
  /** `pikku check` passed in the worktree just now. */
  clean: boolean
}

export interface RunnerPrompts {
  build(context: PromptContext): string
  repair(failure: string): string
  conflict(route: NextRoute): string
}

export interface RunnerOptions {
  /** The project's main checkout: where the changes CLI runs and changesets are merged. */
  cwd: string
  /** Agents at once, at most 3 (MAX_PARALLEL). */
  parallel: number
  /** Agent starts per change in one run before its worktree is given up (default 2). */
  tries?: number
  /** Minutes an agent may be quiet with no tool running (default 10; 0 is off). */
  stallMinutes?: number
  /** Minutes one tool may run (default 45; 0 is off). */
  toolMaxMinutes?: number
  /** Agent turns of one branch's merge conflict before it is given up (default 2). */
  conflictTries?: number
  /** Repair turns of a red main checkout in one run (default 2). */
  repairTries?: number
  /** Agent starts in one run, builds, repairs and conflicts together (default 40). */
  maxTurns?: number
  /** The whole run; when it is up the agents are stopped and the run ends (default none). */
  maxMinutes?: number
  /** Who the runner claims as (default `pikku-changes-run`). */
  claimant?: string
  leaseMinutes?: number
  /** Leases this runner may take back when no agent of its own holds them (left by a restart). Default: its claimant and `pikku-cli`. */
  ownsLease?: (claimedBy: string) => boolean
  /** Added to every CLI call and agent environment. */
  env?: Record<string, string>
  /** A local CLI build every worktree is relinked to, or none (a plain install). */
  localCli?: LocalCli
  /** Replaces the default setup of a checkout; '' is none. */
  setupCommand?: string
  /** Checks a checkout (default `pikku check`; '' is none). */
  checkCommand?: string
  /** Stops after claiming: the changes claimed by the first fill are built (and picked up again within `tries`), no more are claimed, and finished changesets are merged only when the host calls `mergeFinished()`. The run ends with `stepped: true`, which is not an error. */
  step?: boolean
  /** Other `pikku changes next` routes handled as builds of the changes in their context, where they would end the run (default none: knowledge and upgrade routes end it). */
  extraRoutes?: ExtraRoute[]
  /** Counters a run starts from, to continue an earlier one (see `ChangesRunner.counters`). */
  counters?: Partial<RunnerCounters>
  /** Startup self-check before the first fill (default true). */
  selfCheck?: boolean
  /** More startup checks of the host (a model login, a browser, repository settings): each string is one problem, or problems and what was fixed. */
  extraChecks?: () => Promise<string[] | { problems: string[]; done: string[] }>
  /** Uncommitted paths in the main checkout the self-check does not count as stray. */
  strayIgnore?: string[]
  /** Runs before a worktree is cut from the main checkout's HEAD (a host commits what it wrote there). */
  beforeClaim?: () => Promise<void>
  /** Directory holding the bun and pikku shims put first on every agent's PATH (written only with a local CLI). */
  shimDir?: string
  /** Where the relink script lives, for the bun shim (default the built copy next to this module). */
  relinkScript?: string
  prompts?: Partial<RunnerPrompts>
  /** The node binary the shims and setup run the local CLI with (default process.execPath). */
  node?: string
}

/** The routes of `pikku changes next` other than `changes` that can be handled as builds. */
export type ExtraRoute = 'intake' | 'knowledge' | 'upgrade'

/** What a run has counted, readable and settable between runs. */
export interface RunnerCounters {
  /** Agent starts per change id (limit: the `tries` option). */
  tries: Record<string, number>
  /** Worktree setup failures per change id (limit: the `tries` option). */
  prepFails: Record<string, number>
  /** Merge-conflict turns per branch (limit: the `conflictTries` option). */
  conflicts: Record<string, number>
  /** Agent starts of all kinds (limit: the `maxTurns` option). */
  turns: number
  /** Repair turns (limit: the `repairTries` option). */
  repairs: number
}

/** What `pikku changes next` prints with --json. */
export interface NextRoute {
  agent: 'changes' | 'intake' | 'knowledge' | 'upgrade' | null
  skill: string | null
  specialist?: string | null
  refs: string[]
  reason: string
  context: string | null
  merged: string[]
}

export interface RunResult {
  /** The run ended because nothing was left to build; false when an error, a stop or a limit ended it. */
  ok: boolean
  reason: string
  /** The run stopped after claiming because the `step` option is on; `ok` is true and the changesets built are not merged yet. */
  stepped: boolean
  merged: string[]
  turns: number
}
