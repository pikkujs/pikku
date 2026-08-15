/**
 * What a scorer is shown about a finished run.
 *
 * One snapshot, taken after the output middleware has resolved, so a scorer and
 * the persisted run record see the same thing — including the redactions.
 */
export interface ScorerInput {
  runId: string
  agentName: string
  threadId?: string
  resourceId?: string
  /** The user prompt the run answered. */
  input: string
  /** The agent's final text answer. */
  output: string
  /**
   * The known-correct answer. Supplied by a scenario for a reference-based
   * judge; never set on live traffic, which has no answer key.
   */
  reference?: string
  toolCalls: {
    name: string
    args: unknown
    result?: unknown
    error?: string
  }[]
  usage: {
    inputTokens: number
    outputTokens: number
    model?: string
  }
}

export interface ScorerOutput {
  /** 0..1, so grades are comparable across scorers. */
  score: number
  reason?: string
  metadata?: Record<string, unknown>
}

/**
 * The queue a scorer's jobs go to. Two lanes exist only so a flood of slow
 * LLM-judge jobs cannot starve the cheap heuristic ones; within a lane it is
 * plain FIFO.
 */
export type ScorerLane = 'fast' | 'slow'

export const SCORER_LANE_QUEUES: Record<ScorerLane, string> = {
  fast: 'agent-score-fast',
  slow: 'agent-score-slow',
}

/**
 * How much of the run's trajectory the default judge prompt discloses.
 *
 * A judge is a third-party model, and a tool's arguments and results are the
 * most sensitive thing a run touches — the row it read, the address it looked
 * up, the message it sent. Output middleware has already had its pass by the
 * time a scorer sees any of this, so what a judge is shown is what was stored;
 * this is the second gate, for a judge that should be told less than the
 * database was.
 *
 * - `names` — which tools ran, and whether each failed. No arguments, no
 *   results. Enough to tell an answer backed by a tool from an invented one,
 *   which is the failure this exists to catch, while disclosing no row data.
 * - `full` — names, arguments and results, truncated. For a judge that must
 *   check the answer *against* what the tool returned.
 * - `off` — no trajectory at all. The judge grades the answer alone.
 */
export type JudgeToolCallDisclosure = 'off' | 'names' | 'full'

/**
 * A judge's model call. Present only on a scorer built with `pikkuAgentJudge`;
 * `score` is present only on one built with `pikkuAgentScorer`. Exactly one of the
 * two is set, which is what the two constructors exist to guarantee.
 */
export type ScorerJudgeConfig = {
  model: string
  goal: string
  /** Always set: `pikkuAgentJudge` resolves the default. */
  toolCalls: JudgeToolCallDisclosure
  prompt?: (input: ScorerInput) => string
}

export type PikkuAgentScorer<Services = any> = {
  name: string
  description: string
  lane: ScorerLane
  /** 0..1 fraction of live runs to grade. */
  sampleRate: number
  /**
   * Grades against a known-correct answer, so it is test-only: live traffic has
   * no answer key and the runtime never samples it.
   */
  requiresReference: boolean
  score?: (
    input: ScorerInput,
    services: Services
  ) => ScorerOutput | Promise<ScorerOutput>
  judge?: ScorerJudgeConfig
}

export type ScorerMeta = Record<
  string,
  {
    name: string
    description: string
    lane: ScorerLane
    sampleRate: number
    requiresReference: boolean
    sourceFile?: string
    exportedName?: string
  }
>

/** A single scorer's job on a lane queue. */
export type ScoreJob = ScorerInput & {
  scorerName: string
}

export type AgentRunScore = {
  runId: string
  scorerName: string
  score: number
  reason?: string
  metadata?: Record<string, unknown>
  createdAt: Date
}
