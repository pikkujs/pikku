import { pikkuScenario } from '#pikku/scenarios'

// @snippet start scenarioBasics
// A scenario may only reach for `logger` and `config`. Everything else goes
// through an actor step, because the point is to exercise the deployed
// environment over the real transport — a scenario that queried the database
// directly would prove the database has rows, not that the product works.
export const memberSeesOnlyTheirWorkspace = pikkuScenario({
  title: 'A member reads their own organisation',
  description: 'Proves the tenancy permission passes for a member and the query is scoped.',
  tags: ['tenancy'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.viv) {
      throw new Error('needs the `viv` persona — run via `pikku scenario run`')
    }
    const viv = actors.viv

    // Which organisation, asked as the actor rather than looked up. This is
    // also the only cross-tenant read in the product: "which are mine" is a
    // question about the membership table, not about one tenant's rows.
    const mine = await scenario.do(
      'Member lists their organisations',
      'listMyOrgs',
      {},
      { actor: viv }
    )

    const org = mine.organisations[0]
    if (!org) throw new Error('The persona belongs to no organisation — seed one first')

    const issues = await scenario.do(
      'Member lists issues in that organisation',
      'listIssues',
      { orgId: org.orgId, limit: 10 },
      { actor: viv }
    )

    logger.info({ event: 'scenario_issues_read', count: issues.issues.length })
    return { issueCount: issues.issues.length }
  },
})
// @snippet end scenarioBasics

// @snippet start scenarioConverse
// Deterministic RPC steps only test half an agent-powered product. `converse`
// lets the actor hold a free-form conversation in persona: an LLM plays them
// using their `personality` and `jobTitle`, drives the agent over the real
// transport as the signed-in actor, answers tool-approval requests in
// character, and returns a verdict.
export const workspaceAssistantConversation = pikkuScenario({
  title: 'A person asks the assistant for help',
  description: 'Drives the agent in persona and checks the outcome, not the wording.',
  tags: ['agent'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.viv) {
      throw new Error('needs the `viv` persona — run via `pikku scenario run`')
    }

    const verdict = await scenario.do('Ask the assistant', async () =>
      actors.viv.converse({
        agent: 'workspaceAssistant',
        task: 'What is still open in my workspace?',
        evaluate: 'The assistant listed issues from an organisation the actor belongs to.',
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
