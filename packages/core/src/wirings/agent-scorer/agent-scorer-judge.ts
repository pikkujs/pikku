import type { AgentRunnerService } from '../../services/agent-runner-service.js'
import type { AgentMessage } from '../agent/agent.types.js'
import { randomUUID } from '../agent/agent-utils.js'
import type {
  PikkuAgentScorer,
  ScorerInput,
  ScorerJudgeConfig,
  ScorerOutput,
} from './agent-scorer.types.js'

const JUDGE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    score: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'How well the answer meets the rubric. 1 is best.',
    },
    reason: {
      type: 'string',
      description: 'One or two sentences explaining the score.',
    },
  },
  required: ['score', 'reason'],
  additionalProperties: false,
}

/**
 * The message a judge grades when its scorer supplies no `prompt`.
 *
 * A reference-based judge is shown the answer key; a reference-free one is not,
 * and grades the answer on its own merits.
 */
export const buildJudgePrompt = (
  judge: ScorerJudgeConfig,
  input: ScorerInput
): string => {
  if (judge.prompt) return judge.prompt(input)

  const sections = [`User asked:\n${input.input}`]
  if (input.reference !== undefined) {
    sections.push(`Reference answer:\n${input.reference}`)
  }
  sections.push(`Assistant answered:\n${input.output}`)
  sections.push(judge.goal)
  sections.push('Respond with a score 0..1 and a brief reason.')
  return sections.join('\n\n')
}

/**
 * Clamp rather than reject: a model that answers 1.2 has still made a legible
 * judgement, and failing the job would lose it. A non-number has not.
 */
const normalizeScore = (scorerName: string, value: unknown): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(
      `Judge '${scorerName}' returned a non-numeric score: ${JSON.stringify(value)}`
    )
  }
  return Math.min(1, Math.max(0, value))
}

/**
 * Run an LLM judge and force the `{ score, reason }` contract, so a scorer
 * author writes a rubric rather than a parser.
 *
 * A judge has no tools, which is the one case where an output schema is
 * reliably honoured.
 */
export const runJudge = async (
  scorer: PikkuAgentScorer<any>,
  input: ScorerInput,
  agentRunner: AgentRunnerService | undefined
): Promise<ScorerOutput> => {
  const judge = scorer.judge
  if (!judge) {
    throw new Error(`Scorer '${scorer.name}' is not a judge`)
  }
  if (!agentRunner) {
    throw new Error(
      `Judge '${scorer.name}' needs an AI provider, but no agentRunner is registered in this process. ` +
        `A worker deployed apart from the API has to register one to run the slow scoring lane.`
    )
  }
  if (scorer.requiresReference && input.reference === undefined) {
    throw new Error(
      `Judge '${scorer.name}' grades against a reference answer, but none was supplied`
    )
  }

  const messages: AgentMessage[] = [
    {
      id: randomUUID(),
      role: 'user',
      content: buildJudgePrompt(judge, input),
      createdAt: new Date(),
    },
  ]

  const result = await agentRunner.run({
    model: judge.model,
    instructions: judge.goal,
    messages,
    tools: [],
    maxSteps: 1,
    toolChoice: 'none',
    outputSchema: JUDGE_OUTPUT_SCHEMA,
  })

  const object = (result.object ?? {}) as { score?: unknown; reason?: unknown }
  return {
    score: normalizeScore(scorer.name, object.score),
    ...(typeof object.reason === 'string' ? { reason: object.reason } : {}),
    metadata: {
      judgeModel: judge.model,
      judgeTokens: result.usage.inputTokens + result.usage.outputTokens,
    },
  }
}
