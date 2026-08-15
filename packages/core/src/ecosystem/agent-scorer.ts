export { gradeRun } from '../wirings/agent-scorer/agent-scorer-grade.js'
export { addAgentScorer } from '../wirings/agent-scorer/agent-scorer-registry.js'
export {
  enableScoreSnapshots,
  getScoreSnapshot,
} from '../wirings/agent-scorer/agent-scorer-snapshots.js'
export { wireAgentScorerQueueWorkers } from '../wirings/agent-scorer/agent-scorer-worker.js'
export {
  pikkuAgentJudge,
  pikkuAgentScorer,
} from '../wirings/agent-scorer/agent-scorer.js'
export type {
  AgentRunScore,
  ScorerMeta,
} from '../wirings/agent-scorer/agent-scorer.types.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type {
  PikkuAgentScorer,
  ScoreJob,
  ScorerInput,
  ScorerOutput,
} from '../wirings/agent-scorer/agent-scorer.types.js'
