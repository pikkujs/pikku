import { runJudge } from './ai-scorer-judge.js'
import { resolveAIScorer } from './ai-scorer-registry.js'
import type { ScoreJob, ScorerOutput } from './ai-scorer.types.js'

/**
 * Grade one run with one scorer.
 *
 * The single path both callers take — the lane worker on live traffic and the
 * scenario grading RPC — so a scenario's grade is the same computation the
 * production sampler would have made, not an approximation of it.
 *
 * Persisting is optional because the two callers differ on it: a live grade is
 * only useful once recorded, while a scenario asserts on the returned value and
 * runs against servers that may have no run-state adapter at all.
 */
export const gradeRun = async (
  job: ScoreJob,
  services: {
    aiAgentRunner?: unknown
    aiRunState?: {
      saveScore: (score: {
        runId: string
        scorerName: string
        score: number
        reason?: string
        metadata?: Record<string, unknown>
      }) => Promise<void>
    }
  },
  options: { persist: boolean }
): Promise<ScorerOutput> => {
  const { scorerName, ...input } = job
  const scorer = resolveAIScorer(scorerName)

  const result = scorer.score
    ? await scorer.score(input, services)
    : await runJudge(scorer, input, services.aiAgentRunner as never)

  if (options.persist) {
    if (!services.aiRunState) {
      throw new Error(
        `AI run state service not initialized: cannot record the '${scorerName}' grade of run ${job.runId}`
      )
    }
    await services.aiRunState.saveScore({
      runId: job.runId,
      scorerName,
      score: result.score,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
      ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
    })
  }

  return result
}
