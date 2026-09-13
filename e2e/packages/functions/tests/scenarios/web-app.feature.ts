/**
 * The browser half of flags and analytics, driven through a real page.
 *
 * Everything the other two suites assert, they assert against the wires:
 * `GET /feature-flags` answers booleans, `POST /analytics` records what it is
 * sent. That leaves the part a client library owns untested — whether a React
 * app actually hides a panel behind a dark flag, whether a view fires an event
 * without anyone calling `flush`, and whether refusing a banner is enough to
 * keep a device id off the machine.
 *
 * The app under test is `e2e/packages/web`: an ordinary consumer of
 * `@pikku/react` with no test hooks, served by the same server on `/app` so
 * the cookies the identity resolver writes are same-origin. It is mounted
 * through `staticMounts` in `e2e/src/config.ts`, which is also the only reason
 * these scenarios need no second process.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const APP = '/app'
const DEVICE_COOKIE = 'pikku_aid'

/**
 * A flag the operator has switched off is a panel the app does not render.
 *
 * The reload is the subject, not a workaround: the client fetches the map once
 * per session, which is what keeps a flag from costing a request per component,
 * and the cost of that choice is that an operator's change reaches an open tab
 * on its next load. Asserting it here pins the behaviour rather than leaving it
 * to be discovered.
 */
export const webFlagHidesAndRevealsAPanelScenario = pikkuScenario<
  void,
  { revealed: true }
>({
  title: 'A dark flag hides its panel, and switching it on brings it back',
  description:
    'The React client renders what the same wire the function reads answers',
  tags: ['scenario', 'feature-flags', 'browser'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.do(
      'the operator kills the report',
      'admin:flagSetEnabled',
      { name: 'quarterlyReports', enabled: false, note: 'e2e web app' },
      { actor: actors.admin }
    )

    await scenario.given(
      'the visitor opens the app',
      'opensConsolePage',
      { path: APP, waitFor: { testId: 'app' } },
      { actor: actors.guest }
    )
    await scenario.then(
      'no panel is rendered for a feature that is off',
      'doesNotSeeTestId',
      { testId: 'quarterly-panel' },
      { actor: actors.guest }
    )

    await scenario.do(
      'the operator switches it on',
      'admin:flagSetEnabled',
      { name: 'quarterlyReports', enabled: true },
      { actor: actors.admin }
    )
    await scenario.when(
      'the visitor reloads',
      'opensConsolePage',
      { path: APP, waitFor: { testId: 'app' } },
      { actor: actors.guest }
    )
    await scenario.then(
      'the panel is there',
      'seesTestId',
      { testId: 'quarterly-panel' },
      { actor: actors.guest }
    )

    return { revealed: true }
  },
})

/**
 * Two views, one visitor, one device id.
 *
 * Nothing in the scenario calls `flush`: the events leave on the client's own
 * timer, which is the only way a page view is ever sent in a real app. The
 * second view is navigated to in the SPA rather than loaded, so the id under
 * assertion has to survive within a session rather than being re-minted by a
 * fresh document.
 */
export const webPageViewsReachTheDestinationScenario = pikkuScenario<
  void,
  { recorded: number }
>({
  title: 'Navigating the app sends its page views, once, as one visitor',
  description:
    'The client buffers, sends on its own timer, and keeps one device id',
  tags: ['scenario', 'analytics', 'browser'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'the visitor opens the app',
      'opensConsolePage',
      { path: APP, waitFor: { testId: 'app' } },
      { actor: actors.guest }
    )
    await scenario.given(
      'and accepts analytics',
      'clicksTestId',
      { testId: 'consent-accept' },
      { actor: actors.guest }
    )
    // Reloaded, then emptied, so every event asserted on below was fired by a
    // page that already had consent. Whether the view fired *before* the
    // banner was answered survives its own flush is a race with the client's
    // timer, and it is not what this scenario is about.
    await scenario.given(
      'and comes back with the banner answered',
      'opensConsolePage',
      { path: APP, waitFor: { testId: 'app' } },
      { actor: actors.guest }
    )
    await scenario.do('empties the destinations', 'resetAnalytics', null, {
      actor: actors.guest,
    })

    await scenario.when(
      'they open pricing',
      'clicksTestId',
      { testId: 'nav-pricing' },
      { actor: actors.guest }
    )
    await scenario.when(
      'and the client sends',
      'waitsForAnalyticsFlush',
      undefined,
      { actor: actors.guest }
    )

    const recorded = await scenario.do(
      'reads the destination back',
      'readAnalytics',
      null,
      { actor: actors.guest }
    )
    await scenario.then(
      'both views arrived, as the client’s own events',
      'expectsRecordedEvents',
      { recorded, all: ['page_viewed', 'page_viewed'] }
    )
    await scenario.then(
      'the second carries the path the visitor navigated to',
      'expectsRecordedEvent',
      {
        recorded: { all: recorded.all.slice(1) },
        name: 'page_viewed',
        expected: { source: 'client', props: { path: '/pricing' } },
      }
    )

    const cookie = await scenario.then(
      'the visitor was given a device id',
      'readsBrowserCookie',
      { name: DEVICE_COOKIE },
      { actor: actors.guest }
    )
    await scenario.then('it is there', 'expectsBrowserCookie', {
      read: cookie,
      present: true,
    })

    return { recorded: recorded.all.length }
  },
})

/**
 * Refusing the banner has to be the whole answer.
 *
 * Two claims, and the weaker one alone would be a false pass: nothing is sent,
 * *and* nothing is stored. An app that buffered the events and dropped them at
 * the ingest would satisfy the first while still having handed the visitor an
 * identifier they declined.
 */
export const webRefusingConsentSendsNothingScenario = pikkuScenario<
  void,
  { recorded: 0 }
>({
  title: 'A visitor who refuses is neither measured nor identified',
  description: 'The buffer is discarded and no device id is ever written',
  tags: ['scenario', 'analytics', 'browser'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.do('empties the destinations', 'resetAnalytics', null, {
      actor: actors.guest,
    })

    await scenario.given(
      'the visitor opens the app',
      'opensConsolePage',
      { path: APP, waitFor: { testId: 'app' } },
      { actor: actors.guest }
    )
    await scenario.when(
      'and refuses analytics',
      'clicksTestId',
      { testId: 'consent-refuse' },
      { actor: actors.guest }
    )
    await scenario.when(
      'then browses on',
      'clicksTestId',
      { testId: 'nav-pricing' },
      { actor: actors.guest }
    )
    await scenario.when(
      'and the client has every chance to send',
      'waitsForAnalyticsFlush',
      undefined,
      { actor: actors.guest }
    )

    const recorded = await scenario.do(
      'reads the destination back',
      'readAnalytics',
      null,
      { actor: actors.guest }
    )
    await scenario.then(
      'nothing was measured',
      'expectsRecordedEvents',
      { recorded, all: [] }
    )

    const cookie = await scenario.then(
      'and nothing was stored on the device',
      'readsBrowserCookie',
      { name: DEVICE_COOKIE },
      { actor: actors.guest }
    )
    await scenario.then('the jar is empty of it', 'expectsBrowserCookie', {
      read: cookie,
      present: false,
    })

    return { recorded: 0 }
  },
})

export const webAppFeature = pikkuFeature({
  name: 'Web app',
  description:
    'A React consumer of @pikku/react gates on flags and measures itself',
  tags: ['browser'],
  scenarios: [
    webFlagHidesAndRevealsAPanelScenario,
    webPageViewsReachTheDestinationScenario,
    webRefusingConsentSendsNothingScenario,
  ],
})
