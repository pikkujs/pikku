/**
 * The job this app exists for, performed through the browser.
 *
 * An operator opens this app for one reason: something failed and they need to
 * find it. `operatorReadsTheQueue` proves `listRuns` returns rows; it cannot
 * tell you whether the failure is findable on screen, which is the entire
 * purpose of the page.
 *
 * The error text is asserted in full deliberately. It was rendering as "S3…"
 * on narrow viewports for four review rounds — every liveness check passed
 * throughout, because a truncated string is still a rendered string.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const operatorFindsTheFailureInTheBrowser = pikkuScenario<void, { landed: string }>({
  title: 'An operator finds the failing run and reads why',
  description: 'Opens the run list by clicking and reads the failure and its reason in full',
  tags: ['scenario', 'journey'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.ola) {
      throw new Error('needs the `ola` actor — run via `pikku scenario run <environment>`')
    }
    await scenario.then('opens the app', 'opensPage', { path: '/app' }, { actor: actors.ola })
    const arrived = await scenario.then('clicks through to Runs', 'clicks', { name: 'Runs' }, { actor: actors.ola })
    await scenario.then('is on the run list', 'restsOnPath', { path: '/app/runs' }, { actor: actors.ola })

    // 'failing' rather than '1 failing', for the same reason: the count is the
    // seed's arithmetic and anything else starting a run changes it.
    await scenario.then('sees the failure counted', 'seesText', { text: 'failing' }, { actor: actors.ola })
    await scenario.then('sees which flow failed', 'seesText', { text: 'Nightly export' }, { actor: actors.ola })
    await scenario.then('sees the status in full', 'seesText', { text: 'Failed' }, { actor: actors.ola })

    // The whole reason, not a truncated prefix. This is the string the operator
    // acts on, and the one most likely to be clipped by a layout change.
    await scenario.then(
      'reads the whole reason',
      'seesText',
      { text: 'S3 PutObject denied: the warehouse bucket policy no longer allows this role' },
      { actor: actors.ola },
    )

    // The trigger kind must be a label, not the raw database token.
    await scenario.then('sees the trigger named', 'seesText', { text: 'Schedule' }, { actor: actors.ola })

    // Stopping the bleeding, which is the other half of an operator's job and
    // was reachable only over RPC: `cancelRun` was wired, scoped and untouchable.
    await scenario.then(
      'cancels the run that is still going',
      'clicksNear',
      { near: 'Chase unpaid invoices', name: 'Cancel' },
      { actor: actors.ola },
    )
    await scenario.then('sees it cancelled', 'seesText', { text: 'Cancelled' }, { actor: actors.ola })

    // The operations screen, which is also the only thing that opens the
    // channel: `LiveFeed` connects on mount and sends the subscribe action, so
    // asserting the panel is here is the only test that touches the realtime
    // surface at all.
    await scenario.then('opens operations', 'clicks', { name: 'Operations' }, { actor: actors.ola })
    await scenario.then(
      'sees the live panel',
      'seesText',
      { text: 'activity' },
      { actor: actors.ola },
    )

    // The realtime surface, opened and closed deliberately. Visiting the page
    // already runs this handler, but nothing asserted the socket reached OPEN —
    // a channel with a broken route or a failing auth check looks identical to
    // a quiet one.
    await scenario.then(
      'subscribes to the channel',
      'subscribesToChannel',
      { route: '/runs', action: 'watchRun' },
      { actor: actors.ola },
    )

    return { landed: arrived.pathname }
  },
})

export const journeyFeature = pikkuFeature({
  name: 'Browser journey',
  description: 'The job this app exists for, performed by clicking',
  tags: ['journey'],
  scenarios: [operatorFindsTheFailureInTheBrowser],
})
