import type { CoreSingletonServices } from '../../types/core.types.js'
import { scorersForAgent } from './ai-scorer-registry.js'
import { isSampled } from './ai-scorer-sampling.js'
import { SCORER_LANE_QUEUES, type ScorerInput } from './ai-scorer.types.js'

/**
 * Grade one finished run on live traffic.
 *
 * Called as the terminal step of `finalizeAgentRun`, so it is structurally last
 * — a developer cannot register anything after it, and cannot reorder it. It is
 * also strictly best-effort: the client already has its answer, so nothing here
 * may fail the run.
 */
export const scoreFinishedRun = async (
  run: ScorerInput,
  services: Pick<CoreSingletonServices, 'logger'> & {
    queueService?: { add: (queueName: string, data: unknown) => Promise<any> }
  }
): Promise<void> => {
  const scorers = scorersForAgent(run.agentName, services.logger).filter(
    // A reference-based judge grades against an answer key, and live traffic
    // has none.
    (scorer) => !scorer.requiresReference
  )
  if (scorers.length === 0) return

  if (!services.queueService) {
    services.logger?.warn(
      `[pikku] Agent '${run.agentName}' declares scorers but no queue service is registered — skipping live scoring`
    )
    return
  }

  const sampled = scorers.filter((scorer) =>
    isSampled(run.runId, scorer.name, scorer.sampleRate)
  )

  // One message per scorer, so each gets its own retry, isolation and lane.
  await Promise.all(
    sampled.map(async (scorer) => {
      try {
        await services.queueService!.add(SCORER_LANE_QUEUES[scorer.lane], {
          ...run,
          scorerName: scorer.name,
          // No reference: a live run has no answer key.
          reference: undefined,
        })
      } catch (error) {
        services.logger?.error(
          `[pikku] Failed to enqueue the '${scorer.name}' grade of run ${run.runId}`,
          { error }
        )
      }
    })
  )
}
