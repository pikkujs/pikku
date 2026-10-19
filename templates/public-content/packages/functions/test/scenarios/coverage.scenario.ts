/**
 * Every callable function this template owns, exercised once.
 *
 * The journey scenario proves an editor can publish. This one proves nothing is
 * *unreached* — the question that went unasked while `publishWorkflow` sat with
 * three steps of real publishing logic that no caller ever started.
 *
 * Trigger handlers are absent on purpose. Their names appear in the RPC type
 * union, so calling one compiles and then fails at runtime with
 * RPCNotFoundError, because the runtime serves only `expose: true`. The MCP
 * tool is in the same position over RPC, so it is called over the MCP endpoint
 * instead — the one transport that does serve it.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const everyFunctionRuns = pikkuScenario<void, { checked: number }>({
  title: 'Every callable function runs',
  description: 'Invokes each callable function once, so an uncallable one fails loudly',
  tags: ['scenario', 'coverage'],
  func: async ({ logger }, _data, { scenario, actors }) => {
    if (!actors?.jon) {
      throw new Error('needs the `jon` actor — run via `pikku scenario run <environment>`')
    }

    const session = await scenario.do('reads the session', 'getSession', {}, { actor: actors.jon })

    const published = await scenario.do(
      'lists the public index',
      'listPublished',
      { limit: 20 },
      { actor: actors.jon },
    )
    if (published.posts.length === 0) {
      throw new Error('the seed should leave at least one published post')
    }

    // The only caller of `recordView`: reading a post enqueues the count.
    const post = await scenario.do(
      'reads one in full',
      'getPost',
      { slug: published.posts[0]!.slug },
      { actor: actors.jon },
    )

    const drafts = await scenario.do(
      'lists the editorial queue',
      'listDrafts',
      // A step's input type is the schema's OUTPUT, so a defaulted field is
      // still required here.
      { limit: 50 },
      { actor: actors.jon },
    )
    // The post seeded for this scenario, not whichever draft comes first. The
    // browser journey publishes the editorial draft and asserts it appears;
    // consuming it here would break that journey for a reason unrelated to it.
    const unpublished =
      drafts.posts.find((p) => p.postId === 'pst_probe') ??
      drafts.posts.find((p) => p.status !== 'published')
    if (!unpublished) throw new Error('the seed should leave an unpublished post')

    await scenario.do(
      'publishes one directly',
      'publishPost',
      { postId: unpublished.postId },
      { actor: actors.jon },
    )

    // Through the starter, not the workflow: invoked over plain RPC a workflow
    // gets no workflow context and dies on `workflow.do` being undefined.
    const started = await scenario.do(
      'runs the publish workflow',
      'startPublish',
      { postId: unpublished.postId },
      { actor: actors.jon },
    )

    await scenario.do('sweeps anything now due', 'publishScheduled', null, { actor: actors.jon })

    // The scheduled sweep that replaced the setInterval poller. It notices due
    // posts and fires `onPostDue` for each, so this covers both.
    await scenario.do('notices due posts', 'sweepDuePosts', null, { actor: actors.jon })

    // The MCP tool. Annotated unreachable until `pikku dev` was taught to hand
    // the server its generated manifest — the transport was never mounted, so
    // /mcp answered 404 and no client could call it. Now it runs for real.
    await scenario.then(
      'calls listPublishedTool',
      'callsMcpTool',
      { tool: 'listPublishedTool', args: '{\"limit\":5}' },
      { actor: actors.jon },
    )

    logger.info({
      event: 'coverage_pass',
      user: session.email,
      post: post.slug,
      workflow: started.runId,
    })
    return { checked: 10 }
  },
})

export const coverageFeature = pikkuFeature({
  name: 'Coverage',
  description: 'Every callable function runs at least once',
  tags: ['coverage'],
  scenarios: [everyFunctionRuns],
})
