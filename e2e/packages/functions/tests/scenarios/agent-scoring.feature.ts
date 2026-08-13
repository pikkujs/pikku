/**
 * Grading a finished run, and asserting on the grade.
 *
 * The model is the scripted one, so the answer is fixed — which is exactly what
 * makes these deterministic: what is under test is the grading path (the
 * snapshot the runtime keeps, the instrumentation RPC, the scorer resolving by
 * name), not whether an LLM happened to answer well. The scorers are heuristics
 * for the same reason; a judge grading a fixture would be one model asserting
 * against another's script.
 *
 * The agent steps reach the server over plain HTTP and so need no actor, but
 * `expectScore` is an inline RPC — the runner refuses to serve one locally,
 * since the snapshot it grades lives in the server process. Hence the admin
 * actor: it is the persona whose session carries the call there.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const AGENT = 'todoReadAgent'
const RESOURCE_ID = 'agent-scoring'
const PLAIN_TEXT_REPLY = 'The mock model replied with plain text.'

export const scoresAShortAnswerScenario = pikkuScenario<void, { score: 1 }>({
  title: 'A short answer is graded well by the brevity scorer',
  description: 'The scorer sees the run the scenario just triggered',
  tags: ['scenario', 'agent-scoring'],
  func: async (_services, _data, { scenario, actors }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'hello',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })

    await scenario.expectScore('answered briefly', run.runId!, 'brevity', {
      atLeast: 1,
      actor: actors.admin,
    })

    return { score: 1 }
  },
})

/**
 * A run that used a tool grades lower than one that did not, which is what
 * shows the scorer is reading this run rather than returning a constant.
 */
export const scoresToolUseScenario = pikkuScenario<void, { restrained: false }>(
  {
    title: 'A run that reached for a tool grades lower on restraint',
    description: 'The grade moves with the run, so it is not a constant',
    tags: ['scenario', 'agent-scoring'],
    func: async (_services, _data, { scenario, actors }) => {
      const thread = await scenario.given('opens a thread', 'startsAgentThread')
      const run = await scenario.when('runs the agent', 'runsAgent', {
        agent: AGENT,
        script: 'tool-then-text',
        message: 'check my todos',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
      })

      await scenario.expectScore('used a tool', run.runId!, 'restraint', {
        atLeast: 0,
        atMost: 0.5,
        actor: actors.admin,
      })

      return { restrained: false }
    },
  }
)

/**
 * The only way a `requiresReference` scorer is ever reached: live traffic has
 * no answer key, so the runtime filters it out of sampling entirely.
 */
export const gradesAgainstAnAnswerKeyScenario = pikkuScenario<
  void,
  { matched: true }
>({
  title: 'A reference-based scorer grades against the answer key',
  description: 'The scenario supplies what live traffic cannot',
  tags: ['scenario', 'agent-scoring'],
  func: async (_services, _data, { scenario, actors }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'hello',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })

    await scenario.expectScore(
      'matched the answer key',
      run.runId!,
      'matchesAnswerKey',
      { atLeast: 1, reference: PLAIN_TEXT_REPLY, actor: actors.admin }
    )

    return { matched: true }
  },
})

export const agentScoringFeature = pikkuFeature({
  name: 'Agent Scoring',
  description: 'Scorers grade a finished run, and a scenario asserts the grade',
  tags: ['agent-scoring'],
  scenarios: [
    scoresAShortAnswerScenario,
    scoresToolUseScenario,
    gradesAgainstAnAnswerKeyScenario,
  ],
})
