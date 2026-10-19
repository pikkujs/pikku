/**
 * The job this app exists for, performed through the browser.
 *
 * Every other scenario here is either a liveness check (a page rendered, no
 * console errors) or an RPC journey that never touches the DOM. Both pass on an
 * app with no usable interface: `memberSeesOnlyTheirWorkspace` proves the API
 * enforces tenancy, and proves nothing about whether a member can see their
 * issues by looking at the screen.
 *
 * The negative assertion is the point of this file. Tenancy cannot be tested by
 * checking that the right rows appear — a leaking page shows the right rows AND
 * the wrong ones, and every positive assertion still passes. Only
 * `doesNotSeeText` can fail on a leak.
 *
 * Written from what the app claims, not from what its UI currently has. A step
 * that cannot be performed is the finding.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const memberWorksTheirBoardInTheBrowser = pikkuScenario<void, { landed: string }>({
  title: 'A member reads their workspace board and sees no other tenant',
  description: "Opens the board by clicking, reads its issues, and proves the neighbouring organisation's work is absent",
  tags: ['scenario', 'journey'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.dana) {
      throw new Error('needs the `dana` actor — run via `pikku scenario run <environment>`')
    }
    await scenario.then('opens the app', 'opensPage', { path: '/app' }, { actor: actors.dana })

    // Reached by clicking, not by navigating to a known URL. A URL a test knows
    // and a person cannot find is a screen that does not exist for them.
    const arrived = await scenario.then('clicks through to Issues', 'clicks', { name: 'Issues' }, { actor: actors.dana })

    await scenario.then('is on the board', 'restsOnPath', { path: '/app/issues' }, { actor: actors.dana })

    // Dana owns Acme and is a plain member of Northwind, so the board must name
    // which one it resolved to rather than leaving her to guess.
    await scenario.then('the board names its workspace', 'seesText', { text: 'Acme Instruments' }, { actor: actors.dana })

    await scenario.then("sees Acme's urgent issue", 'seesText', { text: 'Sessions drop when the worker restarts' }, { actor: actors.dana })
    await scenario.then('sees its status in full', 'seesText', { text: 'In progress' }, { actor: actors.dana })

    // The seeded Northwind issues. If either ever renders here, the tenant
    // filter has failed in the only place a customer would notice.
    await scenario.then("does not see Northwind's work", 'doesNotSeeText', { text: 'Basket empties on sign-in' }, { actor: actors.dana })
    await scenario.then('nor its second issue', 'doesNotSeeText', { text: 'Out-of-stock items still purchasable' }, { actor: actors.dana })

    // Filing work, which is what an issue tracker is for and which this board
    // could not do: `createIssue` needs a projectId and nothing rendered one.
    await scenario.then(
      'writes what is wrong',
      'typesInto',
      { label: 'What is wrong?', text: 'Search returns archived projects' },
      { actor: actors.dana },
    )
    await scenario.then('raises it', 'clicks', { name: 'Raise it' }, { actor: actors.dana })
    await scenario.then(
      'sees it on the board',
      'seesText',
      { text: 'Search returns archived projects' },
      { actor: actors.dana },
    )

    // And closing it again, next to that row specifically — the board is full
    // of Close buttons and the wrong one is a real mistake.
    await scenario.then(
      'closes it',
      'clicksNear',
      { near: 'Search returns archived projects', name: 'Close' },
      { actor: actors.dana },
    )
    await scenario.then('sees it done', 'seesText', { text: 'Done' }, { actor: actors.dana })

    // The operations screen, which is also the only thing that opens the
    // channel: `LiveFeed` connects on mount and sends the subscribe action, so
    // asserting the panel is here is the only test that touches the realtime
    // surface at all.
    await scenario.then('opens operations', 'clicks', { name: 'Operations' }, { actor: actors.dana })
    await scenario.then(
      'sees the live panel',
      'seesText',
      { text: 'activity' },
      { actor: actors.dana },
    )

    // the analytics beacon — an HTTP-only surface. Posting from the browser rather than
    // exposing it over RPC keeps the boundary it demonstrates intact.
    await scenario.then(
      'posts to /api/analytics',
      'postsTo',
      { path: '/api/analytics', body: '{"events":[{"event":{"name":"page_viewed","path":"/app/issues"}}]}', minStatus: 0,
        maxStatus: 299 },
      { actor: actors.dana },
    )

    // The realtime surface, opened and closed deliberately. Visiting the page
    // already runs this handler, but nothing asserted the socket reached OPEN —
    // a channel with a broken route or a failing auth check looks identical to
    // a quiet one.
    await scenario.then(
      'subscribes to the channel',
      'subscribesToChannel',
      { route: '/board', action: 'watchOrg' },
      { actor: actors.dana },
    )

    return { landed: arrived.pathname }
  },
})

export const journeyFeature = pikkuFeature({
  name: 'Browser journey',
  description: 'The job this app exists for, performed by clicking',
  tags: ['journey'],
  scenarios: [memberWorksTheirBoardInTheBrowser],
})
