import { pikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'
import { wireQueueWorker } from '../queue/queue-runner.js'
import { runJudge } from './ai-scorer-judge.js'
import { resolveAIScorer } from './ai-scorer-registry.js'
import { SCORER_LANE_QUEUES, type ScoreJob } from './ai-scorer.types.js'

/**
 * The one worker behind both lanes: it resolves the scorer by name and grades.
 * The lane a job arrived on decides nothing except how long it may take.
 */
export async function pikkuAIScoreWorkerFunc(
  _services: Record<string, unknown>,
  job: ScoreJob
): Promise<void> {
  const services = pikkuState(null, 'package', 'singletonServices')
  if (!services?.aiRunState) {
    throw new Error(
      `AI run state service not initialized: cannot record the '${job.scorerName}' grade of run ${job.runId}`
    )
  }

  const { scorerName, ...input } = job
  const scorer = resolveAIScorer(scorerName)

  const result = scorer.score
    ? await scorer.score(input, services)
    : await runJudge(scorer, input, services.aiAgentRunner)

  await services.aiRunState.saveScore({
    runId: job.runId,
    scorerName,
    score: result.score,
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
    ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
  })
}

const SCORE_WORKER_FUNC_ID = 'pikkuAIScoreWorker'

/**
 * Bind the two lane queues to the shared worker.
 *
 * Registered programmatically rather than emitted into the user's bootstrap:
 * `wireQueueWorker` warns and returns for a name codegen produced no metadata
 * for, so the metadata is synthesised here alongside the registration. This
 * mirrors how workflows wire their own queues.
 */
export const wireAIScorerQueueWorkers = (): void => {
  // No scorers means no lanes: a deployment that grades nothing should not be
  // left holding two queues nothing ever writes to.
  if (pikkuState(null, 'agent', 'scorers').size === 0) return

  const functions = pikkuState(null, 'function', 'functions')
  const functionsMeta = pikkuState(null, 'function', 'meta')
  const queueMeta = pikkuState(null, 'queue', 'meta')

  if (!functions.has(SCORE_WORKER_FUNC_ID)) {
    addFunction(SCORE_WORKER_FUNC_ID, { func: pikkuAIScoreWorkerFunc } as never)
  }
  if (!functionsMeta[SCORE_WORKER_FUNC_ID]) {
    functionsMeta[SCORE_WORKER_FUNC_ID] = {
      pikkuFuncId: SCORE_WORKER_FUNC_ID,
      sessionless: true,
      functionType: 'helper',
      inputSchemaName: null,
      outputSchemaName: null,
    }
  }

  for (const queueName of Object.values(SCORER_LANE_QUEUES)) {
    if (!queueMeta[queueName]) {
      queueMeta[queueName] = {
        pikkuFuncId: SCORE_WORKER_FUNC_ID,
        name: queueName,
      }
    }
    wireQueueWorker({
      name: queueName,
      func: { func: pikkuAIScoreWorkerFunc },
    } as never)
  }
}
