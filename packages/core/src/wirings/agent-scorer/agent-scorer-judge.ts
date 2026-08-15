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
 * The default disclosure: which tools ran and which failed, and nothing about
 * what went in or came back. A judge that can see a run reached `listTodos`
 * can tell a retrieved list from an invented one, which is the whole of what
 * the trajectory is needed for — the rows themselves it does not need, and an
 * error string is a tool's own words about the caller's data, so it is
 * summarised rather than quoted.
 */
const describeToolCallName = (call: ScorerInput['toolCalls'][number]): string =>
  `- ${call.name}${call.error ? ' (failed)' : ''}`

/** Everything about a call, for a judge that grades against what came back. */
const describeToolCall = (call: ScorerInput['toolCalls'][number]): string => {
  const outcome = call.error
    ? `failed: ${call.error}`
    : `returned ${formatToolValue(call.result)}`
  return `- ${call.name}(${formatToolValue(call.args)}) ${outcome}`
}

/**
 * A tool's arguments and result are arbitrary JSON, and some of it is large —
 * a listing, a document, a page of search results. Truncating keeps a single
 * fat call from crowding the answer out of the judge's context; what survives
 * is the head, which is where the shape of a value is.
 */
const TOOL_VALUE_LIMIT = 500

const formatToolValue = (value: unknown): string => {
  if (value === undefined) {
    return 'nothing'
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) {
    return 'nothing'
  }
  return text.length > TOOL_VALUE_LIMIT
    ? `${text.slice(0, TOOL_VALUE_LIMIT)}… (truncated)`
    : text
}

/**
 * The message a judge grades when its scorer supplies no `prompt`.
 *
 * A reference-based judge is shown the answer key; a reference-free one is not,
 * and grades the answer on its own merits.
 *
 * The tool calls are shown because without them a judge cannot tell a fact from
 * a fabrication. Grading a todo agent that had just listed the user's todos
 * correctly, a judge given only the answer called it "a plausible-looking list"
 * that "offers no real access to your actual list, making it effectively a
 * guess", and scored 0.2 what it scored 1 on other runs — right by its rubric,
 * on the evidence it was given, and wrong about the run. An agent that answers
 * from a tool and one that invents the same sentence are indistinguishable in
 * the output alone; they differ only in what the run did to get there.
 *
 * How much of that to show is `judge.toolCalls`, and the default stops at the
 * names: the 0.2 was the judge doubting the run had any access, and a name
 * settles that without handing a third-party model the rows.
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
  if (judge.toolCalls !== 'off' && input.toolCalls.length > 0) {
    const describe =
      judge.toolCalls === 'full' ? describeToolCall : describeToolCallName
    sections.push(
      `Tools the assistant ran:\n${input.toolCalls.map(describe).join('\n')}`
    )
  }
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
