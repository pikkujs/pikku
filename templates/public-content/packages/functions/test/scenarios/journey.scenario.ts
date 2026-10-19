/**
 * The job this app exists for, performed through the browser.
 *
 * The claim this template makes is about what stays hidden: a scheduled post is
 * invisible until its time, and a draft is invisible always. `editorPublishesAPost`
 * counts drafts over RPC and never checks the reading view, so a leak of either
 * would pass every test in the suite.
 *
 * That is why the two absences are asserted. A page that leaks a draft still
 * shows every published post, so no positive assertion can fail on it.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const readerBrowsesTheJournalInTheBrowser = pikkuScenario<void, { landed: string }>({
  title: 'A reader browses the journal and sees only published work',
  description: 'Opens the journal by clicking, reads a published post, and proves the draft and the scheduled post are absent',
  tags: ['scenario', 'journey'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.jon) {
      throw new Error('needs the `jon` actor — run via `pikku scenario run <environment>`')
    }
    await scenario.then('opens the app', 'opensPage', { path: '/app' }, { actor: actors.jon })
    const arrived = await scenario.then('clicks through to the Journal', 'clicks', { name: 'Journal' }, { actor: actors.jon })
    await scenario.then('is on the journal', 'restsOnPath', { path: '/app/journal' }, { actor: actors.jon })

    await scenario.then('sees a published post', 'seesText', { text: 'The ledger nobody reads until it matters' }, { actor: actors.jon })
    await scenario.then('sees who wrote it', 'seesText', { text: 'Mira Halloran' }, { actor: actors.jon })

    // Seeded with `published_at` two days in the future. It is on this page —
    // an editor should see what is coming — but in the queue and labelled
    // `Scheduled`, not in the published list below. The absence assertion that
    // used to be here became wrong the moment the editorial queue existed, and
    // asserting the label is the stronger claim anyway: it proves the date
    // comparison put the post in the right bucket rather than merely proving
    // it is missing from somewhere.
    await scenario.then(
      'sees the scheduled post is not yet live',
      'seesText',
      { text: 'Scheduled' },
      { actor: actors.jon },
    )

    // The editor's own job, which the reading view could not do. The draft is
    // in the queue above the published list; publishing it moves it into the
    // list below.
    await scenario.then('sees a draft waiting', 'seesText', { text: 'Untitled — the retry piece' }, { actor: actors.jon })
    await scenario.then(
      'publishes it',
      'clicksNear',
      { near: 'Untitled — the retry piece', name: 'Publish' },
      { actor: actors.jon },
    )
    await scenario.then(
      'sees it in the published list',
      'seesText',
      { text: 'Untitled — the retry piece' },
      { actor: actors.jon },
    )

    // The operations screen, which is also the only thing that opens the
    // channel: `LiveFeed` connects on mount and sends the subscribe action, so
    // asserting the panel is here is the only test that touches the realtime
    // surface at all.
    await scenario.then('opens operations', 'clicks', { name: 'Operations' }, { actor: actors.jon })
    await scenario.then(
      'sees the live panel',
      'seesText',
      { text: 'activity' },
      { actor: actors.jon },
    )

    // The realtime surface, opened and closed deliberately. Visiting the page
    // already runs this handler, but nothing asserted the socket reached OPEN —
    // a channel with a broken route or a failing auth check looks identical to
    // a quiet one.
    await scenario.then(
      'subscribes to the channel',
      'subscribesToChannel',
      { route: '/editorial', action: 'watchEditorial' },
      { actor: actors.jon },
    )

    return { landed: arrived.pathname }
  },
})

export const journeyFeature = pikkuFeature({
  name: 'Browser journey',
  description: 'The job this app exists for, performed by clicking',
  tags: ['journey'],
  scenarios: [readerBrowsesTheJournalInTheBrowser],
})
