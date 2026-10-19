/**
 * Every callable function this template owns, exercised once.
 *
 * The journey scenario proves an operator can find a failure and stop a run.
 * This one proves nothing is *unreached* — the question that went unasked while
 * `publishFlow` sat with a graph validation, a version freeze and an activation
 * that no caller ever started.
 *
 * Two kinds of function are deliberately absent, because calling them compiles
 * and then fails at runtime:
 *
 *   MCP tools — their names are in the RPC type union, but the runtime serves
 *   only `expose: true`, so an RPC call gets RPCNotFoundError. They wrap
 *   functions called here directly.
 *
 *   Queue and gateway handlers (`writeAuditEvent`, `onWebhookReceived`) —
 *   reached by an enqueue or an inbound webhook, not by a call. They run when
 *   their own transport delivers something.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const everyFunctionRuns = pikkuScenario<void, { checked: number }>({
  title: 'Every callable function runs',
  description: 'Invokes each callable function once, so an uncallable one fails loudly',
  tags: ['scenario', 'coverage'],
  func: async ({ logger }, _data, { scenario, actors }) => {
    if (!actors?.ola) {
      throw new Error('needs the `ola` actor — run via `pikku scenario run <environment>`')
    }

    const session = await scenario.do('reads the session', 'getSession', {}, { actor: actors.ola })

    const runs = await scenario.do('lists runs', 'listRuns', { limit: 25 }, { actor: actors.ola })
    if (runs.runs.length === 0) throw new Error('the seed should leave runs')

    // Start one by hand, then stop it — the pair an operator actually performs,
    // and the only way `runFlow` gets a caller outside a trigger.
    const started = await scenario.do(
      'starts a flow by hand',
      'runFlow',
      { flowId: 'flw_invoices', payload: {} },
      { actor: actors.ola },
    )

    await scenario.do(
      'cancels it again',
      'cancelRun',
      { runId: started.runId, reason: 'coverage probe' },
      { actor: actors.ola },
    )

    // Through the starter, not the workflow: invoked over plain RPC a workflow
    // gets no workflow context and dies on `workflow.do` being undefined. This
    // is the first caller validateGraph, freezeVersion and activateFlow have had.
    await scenario.do(
      'publishes a flow version',
      'startFlowPublish',
      { flowId: 'flw_invoices', graph: '{"nodes":[{"id":"n1","type":"query"}]}' },
      { actor: actors.ola },
    )

    await scenario.do('sweeps stuck runs', 'sweepStuckRuns', null, { actor: actors.ola })


    // The scheduled sweep that replaced the setInterval poller. It fires the
    // trigger handler for each row it finds, so this covers both.
    await scenario.do('runs the scheduled sweep', 'sweepPendingWebhooks', null, { actor: actors.ola })

    // The MCP tools, called over the mounted transport as a signed-in actor.
    //
    // Both `rpc.invoke` a session-requiring function, so until MCP carried the
    // caller's request these came back "Authentication required" — the browser
    // sent its cookie and the transport discarded it. The fetch handler now
    // wraps the incoming Request, the runner puts it on the wire, and the app's
    // session middleware is registered globally rather than HTTP-only, so the
    // same scopes a person has apply to an agent.
    await scenario.then(
      'calls listRunsTool',
      'callsMcpTool',
      { tool: 'listRunsTool', args: '{\"limit\":5}' },
      { actor: actors.ola },
    )
    await scenario.then(
      'calls cancelRunTool',
      'callsMcpTool',
      { tool: 'cancelRunTool', args: '{\"runId\":\"run_probe\",\"reason\":\"coverage\"}' },
      { actor: actors.ola },
    )

    logger.info({ event: 'coverage_pass', user: session.email, run: started.runId })
    return { checked: 5 }
  },
})

export const coverageFeature = pikkuFeature({
  name: 'Coverage',
  description: 'Every callable function runs at least once',
  tags: ['coverage'],
  scenarios: [everyFunctionRuns],
})
