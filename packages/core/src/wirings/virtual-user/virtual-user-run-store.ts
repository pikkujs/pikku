import type {
  IntentRecord,
  StepRecord,
  VirtualUserDisposition,
  VirtualUserFinding,
  VirtualUserTally,
} from './virtual-user.types.js'

/**
 * One recorded run: who ran, what they were told, and what came back.
 *
 * A run is dispatched and answered for later, so the record is created before
 * the work starts and is the thing the returned `runId` addresses.
 *
 * This record is a run's ONLY trace. A virtual user is not a workflow — it
 * explores, so no two attempts take the same steps and there is nothing to
 * replay — and it is not queued either, because the record already carries the
 * progress a queue would only be holding on the way here.
 *
 * The cost of that is the one thing to know when reading `status`: a restart
 * mid-run leaves a record at `running` with nothing left to finish it. A run
 * older than its budget window and still `running` is dead, not working.
 */
export interface VirtualUserRunRecord {
  runId: string
  persona: string
  disposition: VirtualUserDisposition
  /** What makes a run replayable at all — a finding without it is an anecdote. */
  seed: number
  /**
   * `running` until the engine returns. Not derived from `finishedAt` being
   * unset: a crashed run has no finish time either, and the two are not the
   * same result.
   */
  status: 'running' | 'completed' | 'failed'
  /** The caller's situational goals, run alongside the derived intents. */
  goals: string[]
  /**
   * Ids and slugs the user carried in, and whatever it learned on the way out.
   * Kept because a finding only reproduces alongside the notes that produced it.
   */
  memory: Record<string, string>
  findings: VirtualUserFinding[]
  /**
   * What the user set out to do and how far each one got, which is the spine a
   * transcript hangs off — the steps alone are a list of calls with no account
   * of what they were for.
   *
   * Small and bounded, so it rides on the run row rather than in a table of its
   * own: a run has as many intents as the app has scenarios, and every read of
   * the run wants them.
   */
  intents: IntentRecord[]
  tally: VirtualUserTally | null
  /** Which budget or stopping rule ended the run. */
  stoppedBy: string | null
  /**
   * Why the run itself failed, as opposed to what it found. A run that could
   * not start has no findings and is not a clean empty result.
   */
  error: string | null
  /** The session that started it, where the host tracks one. */
  startedBy: string | null
  createdAt: Date
  finishedAt: Date | null
}

/** What a run is created with — everything else is filled in by the outcome. */
export interface VirtualUserRunStart {
  persona: string
  disposition: VirtualUserDisposition
  seed: number
  goals?: readonly string[]
  memory?: Record<string, string>
  startedBy?: string | null
}

/** The outcome of a run that reached the end of its budget without throwing. */
export interface VirtualUserRunOutcome {
  findings: readonly VirtualUserFinding[]
  tally: VirtualUserTally
  memory: Record<string, string>
  stoppedBy: string | null
  intents: readonly IntentRecord[]
  /**
   * Every turn the run took. Kept because a finding is an assertion until you
   * can see what the user did before it, and because a run that found nothing
   * is only readable as work through its steps.
   *
   * Stored apart from the run — see {@link VirtualUserRunStore.steps} — so
   * listing runs does not drag a budget's worth of turns along with it.
   */
  steps: readonly StepRecord[]
}

/**
 * Where runs are kept. Declared here rather than in a database package so the
 * scaffolded RPCs depend on the shape and not on kysely — `@pikku/kysely` ships
 * one implementation, and an app with its own store satisfies this instead.
 *
 * SECURITY: findings from an `adversarial` run are working exploits carrying
 * live ids. An implementation is a privileged store; the scaffold gates every
 * read behind a scope for that reason, and a host exposing these records more
 * widely is publishing its own exploits.
 */
export interface VirtualUserRunStore {
  /** Records a run as `running` and returns its id. */
  start(run: VirtualUserRunStart): Promise<string>
  /** Marks a run `completed` and stores what it found. */
  complete(runId: string, outcome: VirtualUserRunOutcome): Promise<void>
  /** Marks a run `failed`. The run itself broke; it has no findings. */
  fail(runId: string, error: string): Promise<void>
  get(runId: string): Promise<VirtualUserRunRecord | null>
  /** Newest first. `persona` narrows to one persona's history. */
  list(options?: {
    persona?: string
    limit?: number
    offset?: number
  }): Promise<VirtualUserRunRecord[]>
  /**
   * One run's turns, in the order they happened.
   *
   * Its own call rather than a field on the record: a run at a 500-step budget
   * carries more transcript than every other column put together, and `list`
   * would pay for it on every row.
   */
  steps(
    runId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<StepRecord[]>
}
