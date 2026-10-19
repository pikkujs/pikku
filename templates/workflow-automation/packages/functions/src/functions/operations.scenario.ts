import { pikkuScenario } from '#pikku/scenarios'

// @snippet start scenarioBasics
// The steps run as real users over the real transport, so the scope split
// between operator and builder is exercised rather than asserted.
export const operatorReadsTheQueue = pikkuScenario({
  title: 'An operator reads the run queue',
  description: 'Proves runs:read is enough to see the queue without any flow scope.',
  tags: ['operations'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.ola) {
      throw new Error('needs the `ola` persona — run via `pikku scenario run`')
    }
    const ola = actors.ola

    const runs = await scenario.do(
      'Operator lists recent runs',
      'listRuns',
      { limit: 25 },
      { actor: ola }
    )

    logger.info({ event: 'scenario_runs_read', count: runs.runs.length })
    return { runCount: runs.runs.length }
  },
})
// @snippet end scenarioBasics

// @snippet start scenarioConverse
// Deterministic RPC steps only test half an agent-powered product. `converse`
// lets the actor hold a free-form conversation in persona: an LLM plays them
// using their `personality` and `jobTitle`, drives the agent over the real
// transport as the signed-in actor, answers tool-approval requests in
// character, and returns a verdict.
export const opsAssistantConversation = pikkuScenario({
  title: 'A person asks the assistant for help',
  description: 'Drives the agent in persona and checks the outcome, not the wording.',
  tags: ['agent'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.ola) {
      throw new Error('needs the `ola` persona — run via `pikku scenario run`')
    }

    const verdict = await scenario.do('Ask the assistant', async () =>
      actors.ola.converse({
        agent: 'opsAssistant',
        task: 'Which runs failed recently and why?',
        evaluate: 'The assistant listed recent failed runs.',
      })
    )

    // The verdict is the persona's judgement, which is worth having and is not
    // proof. Follow it with a deterministic check through the same actor when
    // the outcome is checkable.
    if (!verdict.passed) {
      logger.error(verdict.transcript.join('\n'))
      throw new Error(`Assistant flow failed: ${verdict.reasoning}`)
    }

    return { passed: verdict.passed }
  },
})
// @snippet end scenarioConverse
