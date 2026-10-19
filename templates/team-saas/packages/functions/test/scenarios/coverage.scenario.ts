/**
 * Every callable function this template owns, exercised once.
 *
 * The journey scenario proves a member can work their board and sees no other
 * tenant. This one proves nothing is *unreached* — a different question, and
 * the one that went unasked while `onboardOrganisation` sat with three steps
 * and a comment claiming signup started it, when nothing did.
 *
 * Deliberately shallow: it asserts each function runs, not that its behaviour
 * is right. What it catches is a function that has quietly stopped being
 * callable at all.
 *
 * MCP tools are absent on purpose. Their names appear in the RPC type union, so
 * calling one compiles — and then fails at runtime with RPCNotFoundError,
 * because the runtime serves only `expose: true`. The tools wrap functions this
 * scenario already calls directly, so nothing is lost by leaving them out.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const everyFunctionRuns = pikkuScenario<void, { checked: number }>({
  title: 'Every callable function runs',
  description: 'Invokes each callable function once, so an uncallable one fails loudly',
  tags: ['scenario', 'coverage'],
  func: async ({ logger }, _data, { scenario, actors }) => {
    if (!actors?.dana) {
      throw new Error('needs the `dana` actor — run via `pikku scenario run <environment>`')
    }

    const session = await scenario.do('reads the session', 'getSession', {}, { actor: actors.dana })

    const orgs = await scenario.do('lists memberships', 'listMyOrgs', {}, { actor: actors.dana })
    if (orgs.organisations.length === 0) {
      throw new Error('the seed should leave dana in an organisation')
    }
    const orgId = orgs.organisations[0]!.orgId

    const projects = await scenario.do(
      'lists projects',
      'listProjects',
      { orgId, includeArchived: false },
      { actor: actors.dana },
    )
    if (projects.projects.length === 0) throw new Error('the seed should leave a project')

    await scenario.do('lists issues', 'listIssues', { orgId, limit: 50 }, { actor: actors.dana })

    const issue = await scenario.do(
      'raises an issue',
      'createIssue',
      {
        orgId,
        projectId: projects.projects[0]!.projectId,
        title: 'Coverage probe',
        priority: 'normal',
      },
      { actor: actors.dana },
    )

    await scenario.do(
      'closes it again',
      'closeIssue',
      { issueId: issue.issueId, resolution: 'done' },
      { actor: actors.dana },
    )

    // Through the starter, not the workflow: invoked over plain RPC a workflow
    // gets no workflow context and dies on `workflow.do` being undefined.
    await scenario.do(
      'creates a workspace',
      'startOnboarding',
      { name: `Coverage ${issue.issueId.slice(0, 6)}`, slug: `coverage-${issue.issueId.slice(0, 6)}` },
      { actor: actors.dana },
    )

    await scenario.do(
      'sends an invitation',
      'sendInvitation',
      { invitationId: 'inv_1' },
      { actor: actors.dana },
    )

    await scenario.do(
      'reports a seat overage',
      'onSeatsExceeded',
      { orgId, seats: 5, members: 6 },
      { actor: actors.dana },
    )

    await scenario.do('expires stale invitations', 'expireInvitations', null, {
      actor: actors.dana,
    })



    // The scheduled sweep that replaced the setInterval poller. It fires the
    // trigger handler for each row it finds, so this covers both.
    await scenario.do('runs the scheduled sweep', 'sweepSeatUsage', null, { actor: actors.dana })

    // The MCP tools, called over the mounted transport as a signed-in actor.
    //
    // Both `rpc.invoke` a session-requiring function, so until MCP carried the
    // caller's request these came back "Authentication required" — the browser
    // sent its cookie and the transport discarded it. The fetch handler now
    // wraps the incoming Request, the runner puts it on the wire, and the app's
    // session middleware is registered globally rather than HTTP-only, so the
    // same scopes a person has apply to an agent.
    await scenario.then(
      'calls listIssuesTool',
      'callsMcpTool',
      { tool: 'listIssuesTool', args: '{\"orgId\":\"org_acme\",\"limit\":5}' },
      { actor: actors.dana },
    )
    await scenario.then(
      'calls closeIssueTool',
      'callsMcpTool',
      { tool: 'closeIssueTool', args: '{\"issueId\":\"iss_probe\"}' },
      { actor: actors.dana },
    )

    logger.info({ event: 'coverage_pass', user: session.email, issue: issue.issueId })
    return { checked: 10 }
  },
})

export const coverageFeature = pikkuFeature({
  name: 'Coverage',
  description: 'Every callable function runs at least once',
  tags: ['coverage'],
  scenarios: [everyFunctionRuns],
})
