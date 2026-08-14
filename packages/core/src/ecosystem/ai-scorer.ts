export { gradeRun } from '../wirings/ai-scorer/ai-scorer-grade.js'
export { addAIScorer } from '../wirings/ai-scorer/ai-scorer-registry.js'
export {
  enableScoreSnapshots,
  getScoreSnapshot,
} from '../wirings/ai-scorer/ai-scorer-snapshots.js'
export { wireAIScorerQueueWorkers } from '../wirings/ai-scorer/ai-scorer-worker.js'
export { pikkuAIJudge, pikkuAIScorer } from '../wirings/ai-scorer/ai-scorer.js'
export type { ScorerMeta } from '../wirings/ai-scorer/ai-scorer.types.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type {
  PikkuAIScorer,
  ScoreJob,
  ScorerInput,
  ScorerOutput,
} from '../wirings/ai-scorer/ai-scorer.types.js'
