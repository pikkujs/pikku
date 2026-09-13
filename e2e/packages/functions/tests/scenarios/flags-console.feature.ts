/**
 * The console's launch board and the analytics event catalog.
 *
 * The board is the one screen that renders a flag's *lane* rather than its
 * fields, and the lane is derived — `enabled`, `rolloutPercent`, `declared` and
 * `backed` collapse into one of four columns. Asserting the lane through the
 * browser is therefore the only place that derivation is checked against a real
 * store rather than against a literal; the unit tests in
 * `packages/console/src/components/flags/flag-lanes.test.ts` cover the rule, and
 * these cover the rule being fed the truth.
 *
 * Flag state is shared with the `feature-flags` suite, which switches
 * `quarterlyReports` and `bulkExport` around. Every scenario here sets the state
 * it asserts on and puts it back, because the runner shares one server and has
 * no reset between scenarios.
 *
 * Flag names, event names and lane ids are declared in code and safe to select
 * on. The page's own copy is not — it goes through the i18n gate — so every
 * assertion reads a test id or an attribute, never a label.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const FLAGS_PAGE = '/console/flags'
const ANALYTICS_PAGE = '/console/analytics'
const BOARD_READY = { testId: 'flag-card' }
const CATALOG_READY = { testId: 'analytics-event-row' }

const laneColumn = (lane: string) => ({
  testId: 'flag-lane',
  where: { 'data-lane': lane },
})

const card = (name: string) => ({
  testId: 'flag-card',
  where: { 'data-flag-name': name },
})

/** A card in a named lane — the assertion the whole board exists to make. */
const cardInLane = (name: string, lane: string) => ({
  testId: 'flag-card',
  where: { 'data-flag-name': name, 'data-lane': lane },
})

const eventRow = (name: string) => ({
  testId: 'analytics-event-row',
  where: { 'data-event-name': name },
})

export const flagsBoardShowsEveryLaneScenario = pikkuScenario<
  void,
  { lanes: 4 }
>({
  title: 'The board keeps all four lanes, including the empty ones',
  description:
    'An operator reads the board by shape, so a lane that happens to be empty still holds its place',
  tags: ['scenario', 'flags-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'flagsBoardShowsEveryLaneScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the flags board',
      'opensConsolePage',
      { path: FLAGS_PAGE, waitFor: BOARD_READY },
      { actor: actors.admin }
    )

    // Unrolled rather than looped: the scenario extractor reads the steps out
    // of the source, and a loop over an inline array is not a DSL workflow it
    // can express — it would record no steps at all (PKU679).
    await scenario.then(
      'sees the dark lane',
      'seesTestId',
      laneColumn('dark'),
      {
        actor: actors.admin,
      }
    )
    await scenario.then(
      'sees the rolling out lane',
      'seesTestId',
      laneColumn('rolling'),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the live lane',
      'seesTestId',
      laneColumn('live'),
      {
        actor: actors.admin,
      }
    )
    await scenario.then(
      'sees the needs attention lane',
      'seesTestId',
      laneColumn('attention'),
      { actor: actors.admin }
    )

    return { lanes: 4 }
  },
})

export const flagsBoardSortsByLaneScenario = pikkuScenario<
  void,
  { sorted: true }
>({
  title: 'A flag lands in the lane its rollout has reached',
  description:
    'Off is dark, a partial rollout is rolling out, and on with no constraint is live',
  tags: ['scenario', 'flags-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'flagsBoardSortsByLaneScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'switches darkLaunch off',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetEnabled',
        data: { name: 'darkLaunch', enabled: false },
      },
      { actor: actors.admin }
    )
    await scenario.given(
      'switches bulkExport on with no rollout limit',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetEnabled',
        data: { name: 'bulkExport', enabled: true },
      },
      { actor: actors.admin }
    )
    await scenario.given(
      'clears any rollout on bulkExport',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetRollout',
        data: { name: 'bulkExport', percent: null },
      },
      { actor: actors.admin }
    )
    await scenario.given(
      'switches quarterlyReports on',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetEnabled',
        data: { name: 'quarterlyReports', enabled: true },
      },
      { actor: actors.admin }
    )
    await scenario.given(
      'holds quarterlyReports at a quarter of the buckets',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetRollout',
        data: { name: 'quarterlyReports', percent: 25 },
      },
      { actor: actors.admin }
    )

    await scenario.when(
      'opens the flags board',
      'opensConsolePage',
      { path: FLAGS_PAGE, waitFor: BOARD_READY },
      { actor: actors.admin }
    )

    await scenario.then(
      'sees darkLaunch in the dark lane',
      'seesTestId',
      cardInLane('darkLaunch', 'dark'),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees quarterlyReports still rolling out',
      'seesTestId',
      cardInLane('quarterlyReports', 'rolling'),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees bulkExport live',
      'seesTestId',
      cardInLane('bulkExport', 'live'),
      { actor: actors.admin }
    )

    // Put the rollout back: `feature-flags` reads quarterlyReports as a plain
    // on/off flag, and a 25% bucket would admit its actor only by luck.
    await scenario.when(
      'lifts the rollout again',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetRollout',
        data: { name: 'quarterlyReports', percent: null },
      },
      { actor: actors.admin }
    )

    return { sorted: true }
  },
})

export const flagsPanelCarriesOverrideContextScenario = pikkuScenario<
  void,
  { pinned: true }
>({
  title: 'Opening a flag shows who is pinned past its rollout',
  description:
    'The switch, the bucket and the overrides are read together, so they are on one surface',
  tags: ['scenario', 'flags-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'flagsPanelCarriesOverrideContextScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'switches quarterlyReports on',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetEnabled',
        data: { name: 'quarterlyReports', enabled: true },
      },
      { actor: actors.admin }
    )
    await scenario.given(
      'pins an organization past the rollout',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetOverride',
        data: {
          name: 'quarterlyReports',
          subject: { organizationId: 'acme-industrial' },
          enabled: true,
        },
      },
      { actor: actors.admin }
    )

    await scenario.when(
      'opens the flags board',
      'opensConsolePage',
      { path: FLAGS_PAGE, waitFor: BOARD_READY },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens quarterlyReports',
      'clicksTestId',
      card('quarterlyReports'),
      { actor: actors.admin }
    )

    await scenario.then(
      'sees the panel',
      'seesTestId',
      { testId: 'flag-panel' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the flag reported as switched on',
      'expectsControl',
      { testId: 'flag-enabled', checked: true },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the pinned organization',
      'seesTestId',
      {
        testId: 'flag-override',
        where: { 'data-subject-id': 'acme-industrial' },
      },
      { actor: actors.admin }
    )

    await scenario.when(
      'unpins the organization again',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagClearOverride',
        data: {
          name: 'quarterlyReports',
          subject: { organizationId: 'acme-industrial' },
        },
      },
      { actor: actors.admin }
    )

    return { pinned: true }
  },
})

export const flagsPanelFollowsTheFlagScenario = pikkuScenario<
  void,
  { refreshed: true }
>({
  title: 'A rollout set in the panel moves the card and the panel together',
  description:
    'The panel reads the flag by name, so it never describes the flag as it was before the operator changed it',
  tags: ['scenario', 'flags-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'flagsPanelFollowsTheFlagScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'switches bulkExport on with no rollout limit',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetEnabled',
        data: { name: 'bulkExport', enabled: true },
      },
      { actor: actors.admin }
    )
    await scenario.given(
      'clears any rollout on bulkExport',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetRollout',
        data: { name: 'bulkExport', percent: null },
      },
      { actor: actors.admin }
    )

    await scenario.when(
      'opens the flags board',
      'opensConsolePage',
      { path: FLAGS_PAGE, waitFor: BOARD_READY },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees bulkExport live',
      'seesTestId',
      cardInLane('bulkExport', 'live'),
      { actor: actors.admin }
    )
    await scenario.when(
      'opens bulkExport',
      'clicksTestId',
      card('bulkExport'),
      { actor: actors.admin }
    )
    await scenario.when(
      'holds it at a tenth of the buckets',
      'fillsTestId',
      { testId: 'flag-rollout', value: '10' },
      { actor: actors.admin }
    )
    // Clicking the card, not the panel: the panel's own centre is the rollout
    // field itself, so a click there leaves focus exactly where it was and the
    // blur that commits the value never happens. Re-clicking the open card is
    // inert — it selects the flag that is already selected.
    await scenario.when(
      'commits the rollout by leaving the field',
      'clicksTestId',
      card('bulkExport'),
      { actor: actors.admin }
    )

    await scenario.then(
      'sees the card move to the rolling out lane',
      'seesTestId',
      cardInLane('bulkExport', 'rolling'),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the panel agree with the card',
      'expectsTestIdValue',
      { testId: 'flag-rollout', value: '10%' },
      { actor: actors.admin }
    )

    await scenario.when(
      'lifts the rollout again',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetRollout',
        data: { name: 'bulkExport', percent: null },
      },
      { actor: actors.admin }
    )

    return { refreshed: true }
  },
})

export const analyticsCatalogListsDeclaredEventsScenario = pikkuScenario<
  void,
  { listed: true }
>({
  title: 'The catalog lists every event the code declares',
  description:
    'It reads build-time meta, so it is the surface a client may emit rather than a count of what was',
  tags: ['scenario', 'flags-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'analyticsCatalogListsDeclaredEventsScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the analytics catalog',
      'opensConsolePage',
      { path: ANALYTICS_PAGE, waitFor: CATALOG_READY },
      { actor: actors.admin }
    )

    await scenario.then(
      'sees page_viewed declared',
      'seesTestId',
      eventRow('page_viewed'),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees report_viewed declared',
      'seesTestId',
      eventRow('report_viewed'),
      { actor: actors.admin }
    )

    await scenario.when(
      'opens report_viewed',
      'clicksTestId',
      eventRow('report_viewed'),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the event panel',
      'seesTestId',
      { testId: 'analytics-panel' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the prop the declaration wrote',
      'seesTestId',
      { testId: 'analytics-prop', where: { 'data-prop-name': 'report' } },
      { actor: actors.admin }
    )

    return { listed: true }
  },
})

export const flagsConsoleFeature = pikkuFeature({
  name: 'Flags and Analytics Console',
  description:
    'The feature-flag launch board and the analytics event catalog in the console',
  tags: ['flags-console', 'console'],
  scenarios: [
    flagsBoardShowsEveryLaneScenario,
    flagsBoardSortsByLaneScenario,
    flagsPanelCarriesOverrideContextScenario,
    flagsPanelFollowsTheFlagScenario,
    analyticsCatalogListsDeclaredEventsScenario,
  ],
})
