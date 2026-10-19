import { pikkuScenario } from '#pikku/scenarios'

// @snippet start scenarioBasics
// A scenario is a workflow whose steps run as real users over the real
// transport — sign-in, auth middleware, permissions and serialization included.
// One definition is therefore three things: an end-to-end test locally, a smoke
// test against staging, and a health check against production.
export const receptionistChecksSomebodyIn = pikkuScenario({
  title: 'Receptionist checks a guest in',
  description: 'The front desk sees the board and puts an arrival into a clean room.',
  tags: ['front-desk'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.rafa) {
      throw new Error('needs the `rafa` persona — run via `pikku scenario run`')
    }
    const rafa = actors.rafa

    // Each step names what the actor is trying to achieve, the exposed RPC that
    // achieves it, and who performs it. The call goes through that actor's
    // authenticated client — never internal dispatch, which would skip exactly
    // the middleware and permission checks worth testing.
    const rooms = await scenario.do(
      'Receptionist opens the board',
      'listRooms',
      {},
      { actor: rafa }
    )

    const ready = rooms.rooms.filter(
      (r) => r.housekeepingStatus === 'clean' || r.housekeepingStatus === 'inspected'
    )
    if (ready.length === 0) throw new Error('No clean room to check anybody into')

    logger.info({ event: 'scenario_rooms_ready', count: ready.length })
    return { readyRooms: ready.length }
  },
})
// @snippet end scenarioBasics

// @snippet start scenarioConverse
// Deterministic RPC steps only test half an agent-powered product. `converse`
// lets the actor hold a free-form conversation in persona: an LLM plays them
// using their `personality` and `jobTitle`, drives the agent over the real
// transport as the signed-in actor, answers tool-approval requests in
// character, and returns a verdict.
export const frontDeskAssistantConversation = pikkuScenario({
  title: 'A person asks the assistant for help',
  description: 'Drives the agent in persona and checks the outcome, not the wording.',
  tags: ['agent'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.rafa) {
      throw new Error('needs the `rafa` persona — run via `pikku scenario run`')
    }

    const verdict = await scenario.do('Ask the assistant', async () =>
      actors.rafa.converse({
        agent: 'frontDeskAssistant',
        task: 'Find me a clean double room.',
        evaluate: 'The assistant listed rooms and named a clean one.',
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
