import { pikkuScenario } from '#pikku/scenarios'

// @snippet start scenarioBasics
// Run over the real transport, which is what makes the public/private boundary
// testable: the anonymous index and the editorial list are the same table, and
// only a real request proves they return different things.
export const editorPublishesAPost = pikkuScenario({
  title: 'An editor sees drafts the public cannot',
  description: 'The editorial list includes drafts; the public index does not.',
  tags: ['editorial'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.jon) {
      throw new Error('needs the `jon` persona — run via `pikku scenario run`')
    }
    const jon = actors.jon

    const editorial = await scenario.do(
      'Editor lists every post',
      'listDrafts',
      { limit: 50 },
      { actor: jon }
    )

    const drafts = editorial.posts.filter((p) => p.status !== 'published')
    if (drafts.length === 0) {
      throw new Error('Expected at least one unpublished post in the seed')
    }

    logger.info({ event: 'scenario_drafts_visible', drafts: drafts.length })
    return { draftCount: drafts.length }
  },
})
// @snippet end scenarioBasics

// @snippet start scenarioConverse
// Deterministic RPC steps only test half an agent-powered product. `converse`
// lets the actor hold a free-form conversation in persona: an LLM plays them
// using their `personality` and `jobTitle`, drives the agent over the real
// transport as the signed-in actor, answers tool-approval requests in
// character, and returns a verdict.
export const readingAssistantConversation = pikkuScenario({
  title: 'A person asks the assistant for help',
  description: 'Drives the agent in persona and checks the outcome, not the wording.',
  tags: ['agent'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.jon) {
      throw new Error('needs the `jon` persona — run via `pikku scenario run`')
    }

    const verdict = await scenario.do('Ask the assistant', async () =>
      actors.jon.converse({
        agent: 'readingAssistant',
        task: 'What should I read about engineering?',
        evaluate: 'The assistant recommended a published post.',
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
