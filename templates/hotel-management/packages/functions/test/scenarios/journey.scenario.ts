/**
 * The job this app exists for, performed through the browser.
 *
 * The front desk's own subtitle is "Every room, and whether it is ready" — a
 * reading claim, and the first half of this scenario tests exactly that.
 *
 * The second half is expected to FAIL, and the failure is the finding.
 * `receptionistChecksSomebodyIn` completes a check-in over RPC, and the
 * template ships `booking` rows with a `checked_in` status, a `checkStayIn`
 * function and a housekeeping task queue behind it. None of it is reachable by
 * clicking: the front desk is a read-only board. So a receptionist can see that
 * room 103 is ready and has no way to put anybody in it.
 *
 * Do not weaken this to make it pass. It should stay red until the board can
 * take an action, then pass untouched.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const receptionistWorksTheDeskInTheBrowser = pikkuScenario<void, { landed: string }>({
  title: 'A receptionist reads the board and checks a guest in',
  description: 'Reads every room and its state, then performs the check-in the RPC scenario performs headlessly',
  tags: ['scenario', 'journey'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.rafa) {
      throw new Error('needs the `rafa` actor — run via `pikku scenario run <environment>`')
    }
    await scenario.then('opens the app', 'opensPage', { path: '/app' }, { actor: actors.rafa })
    const arrived = await scenario.then('clicks through to the front desk', 'clicks', { name: 'Front desk' }, { actor: actors.rafa })
    await scenario.then('is on the board', 'restsOnPath', { path: '/app/front-desk' }, { actor: actors.rafa })

    // 'ready now' rather than '7 ready now': the count moves whenever anything
    // else books a room, and a journey that breaks on another scenario's data
    // is testing the seed rather than the front desk.
    await scenario.then('sees the ready count', 'seesText', { text: 'ready now' }, { actor: actors.rafa })
    await scenario.then('sees a room number', 'seesText', { text: '103' }, { actor: actors.rafa })

    // The label that spent three fixes being clipped to "OUT OF SER…". Asserting
    // it whole is what turns that class of defect into a red test rather than
    // something a person has to notice in a screenshot.
    await scenario.then('reads the out-of-service room in full', 'seesText', { text: 'Out of service' }, { actor: actors.rafa })

    // The desk's actual job: find who is waiting and put them in a room.
    await scenario.then('goes to the arrivals list', 'clicks', { name: 'Arrivals' }, { actor: actors.rafa })
    await scenario.then('is on the arrivals list', 'restsOnPath', { path: '/app/arrivals' }, { actor: actors.rafa })
    await scenario.then('sees a guest waiting', 'seesText', { text: 'Anja Lindqvist' }, { actor: actors.rafa })

    // Next to that guest, not the first button on the page — several people can
    // be waiting and checking in the wrong one is the mistake this prevents.
    await scenario.then(
      'checks her in',
      'clicksNear',
      { near: 'Anja Lindqvist', name: 'Check in' },
      { actor: actors.rafa },
    )

    // The room assignment is the proof: `checkIn` picks a clean room of the
    // booked type, so a room number appearing is the whole transaction landing.
    await scenario.then('sees her room assigned', 'seesText', { text: 'Room' }, { actor: actors.rafa })
    await scenario.then('and her status changed', 'seesText', { text: 'Checked in' }, { actor: actors.rafa })

    // The operations screen, which is also the only thing that opens the
    // channel: `LiveFeed` connects on mount and sends the subscribe action, so
    // asserting the panel is here is the only test that touches the realtime
    // surface at all.
    await scenario.then('opens operations', 'clicks', { name: 'Operations' }, { actor: actors.rafa })
    await scenario.then(
      'sees the live panel',
      'seesText',
      { text: 'activity' },
      { actor: actors.rafa },
    )

    // the analytics beacon — an HTTP-only surface. Posting from the browser rather than
    // exposing it over RPC keeps the boundary it demonstrates intact.
    await scenario.then(
      'posts to /api/analytics',
      'postsTo',
      { path: '/api/analytics', body: '{"events":[{"event":{"name":"page_viewed","path":"/app/front-desk"}}]}', minStatus: 0,
        maxStatus: 299 },
      { actor: actors.rafa },
    )

    // The realtime surface, opened and closed deliberately. Visiting the page
    // already runs this handler, but nothing asserted the socket reached OPEN —
    // a channel with a broken route or a failing auth check looks identical to
    // a quiet one.
    await scenario.then(
      'subscribes to the channel',
      'subscribesToChannel',
      { route: '/front-desk', action: 'watchHousekeeping' },
      { actor: actors.rafa },
    )

    return { landed: arrived.pathname }
  },
})

export const journeyFeature = pikkuFeature({
  name: 'Browser journey',
  description: 'The job this app exists for, performed by clicking',
  tags: ['journey'],
  scenarios: [receptionistWorksTheDeskInTheBrowser],
})
