/**
 * A flag answers two questions, and the suite's shape follows that split.
 *
 * `available` is global, caller-blind, and the only half the runner enforces —
 * an unavailable feature is a 503, because the caller was allowed and the
 * feature was not on. `capable` comes from the session's scopes, is advisory,
 * and protects nothing: authorization stays in `scopes:`, which is why a
 * caller missing the scope is refused with a 403 whether or not the feature is
 * up, and learns nothing from the refusal about what exists.
 *
 * The seed switches `quarterlyReports` and `bulkExport` on and leaves
 * `darkLaunch` as the declaration created it, so the fixture already contains
 * a live feature and a dark one before any scenario acts.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const REPORT = 'viewQuarterlyReport'
const EXPORT = 'runBulkExport'
const DARK = 'openDarkLaunch'

export const flagsAvailableFeatureIsReachableScenario = pikkuScenario<
  void,
  { status: 200 }
>({
  title: 'A caller who is capable reaches a feature that is available',
  description: 'Both halves true is the only combination that admits anyone',
  tags: ['scenario', 'feature-flags'],
  func: async (_services, _data, { scenario, actors }) => {
    // The seed leaves the flag on and unrestricted, but the console suite puts
    // a rollout bucket on it to fill the board's rolling lane. A bucket left
    // behind by a scenario that failed part-way would admit this guest only by
    // luck, so the one thing this asserts is the one thing it sets.
    await scenario.given(
      'the report is open to everyone, not a bucket',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetRollout',
        data: { name: 'quarterlyReports', percent: null },
      },
      { actor: actors.admin }
    )
    const call = await scenario.when(
      'the guest opens the quarterly report',
      'invokesRpcRaw',
      { rpcName: REPORT },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees the report',
      'expectsRpcResponse',
      { call, status: 200, contains: ['quarterly numbers'] },
      { actor: actors.guest }
    )
    return { status: 200 }
  },
})

export const flagsDarkFeatureIsUnavailableScenario = pikkuScenario<
  void,
  { status: 503 }
>({
  title: 'A feature nobody has switched on answers 503',
  description: 'A synced flag starts off, so a feature ships dark',
  tags: ['scenario', 'feature-flags'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the guest opens the dark launch',
      'invokesRpcRaw',
      { rpcName: DARK },
      { actor: actors.guest }
    )
    await scenario.then(
      'is told the feature is not on, not that they may not have it',
      'expectsRpcResponse',
      { call, status: 503 },
      { actor: actors.guest }
    )
    return { status: 503 }
  },
})

/**
 * The ordering claim: `scopes:` runs first, so an unauthorized caller is
 * refused before availability is consulted. A 503 here would leak that a
 * feature exists to somebody who may not have it.
 */
export const flagsScopeRefusalComesFirstScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'A caller without the scope is refused before the flag is read',
  description: 'A refusal never reports the state of a feature',
  tags: ['scenario', 'feature-flags'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the admin opens the quarterly report unscoped',
      'invokesRpcRaw',
      { rpcName: REPORT },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees a 403 naming the scope, and nothing about the feature',
      'expectsRpcResponse',
      {
        call,
        status: 403,
        contains: ['reports:read'],
        doesNotContain: ['quarterlyReports'],
      },
      { actor: actors.admin }
    )
    return { status: 403 }
  },
})

/**
 * The kill switch, on the path it exists for: `bulkExport` declares no `anyOf`
 * and `runBulkExport` takes no session, so the switch is the whole answer and
 * nobody is watching a UI to notice.
 */
export const flagsKillSwitchClosesASessionlessPathScenario = pikkuScenario<
  void,
  { restored: true }
>({
  title: 'Switching a flag off closes a path with no session behind it',
  description: 'And switching it back on opens it again, with no deploy',
  tags: ['scenario', 'feature-flags'],
  func: async (_services, _data, { scenario, actors }) => {
    const before = await scenario.when(
      'the guest runs the export',
      'invokesRpcRaw',
      { rpcName: EXPORT },
      { actor: actors.guest }
    )
    await scenario.then(
      'it runs',
      'expectsRpcResponse',
      { call: before, status: 200 },
      { actor: actors.guest }
    )

    await scenario.do(
      'the operator kills the feature',
      'admin:flagSetEnabled',
      { name: 'bulkExport', enabled: false, note: 'e2e kill switch' },
      { actor: actors.admin }
    )
    const killed = await scenario.when(
      'the guest runs the export again',
      'invokesRpcRaw',
      { rpcName: EXPORT },
      { actor: actors.guest }
    )
    await scenario.then(
      'it is refused with a 503',
      'expectsRpcResponse',
      { call: killed, status: 503 },
      { actor: actors.guest }
    )

    await scenario.do(
      'the operator switches it back on',
      'admin:flagSetEnabled',
      { name: 'bulkExport', enabled: true },
      { actor: actors.admin }
    )
    const restored = await scenario.when(
      'the guest runs the export once more',
      'invokesRpcRaw',
      { rpcName: EXPORT },
      { actor: actors.guest }
    )
    await scenario.then(
      'it runs again',
      'expectsRpcResponse',
      { call: restored, status: 200 },
      { actor: actors.guest }
    )
    return { restored: true }
  },
})

/**
 * An override is the one genuine OR in the model: it wins over the switch, in
 * either direction, so "off for everyone but these three" stays one row rather
 * than a fan-out over every session.
 */
export const flagsOverrideBeatsTheSwitchScenario = pikkuScenario<
  void,
  { restored: true }
>({
  title: 'An override opens a flag for one subject that is off for everyone',
  description: 'And clearing it puts them back with everybody else',
  tags: ['scenario', 'feature-flags'],
  func: async (_services, _data, { scenario, actors }) => {
    const guest = await scenario.given(
      'the guest reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.guest }
    )

    await scenario.do(
      'the operator kills the report for everyone',
      'admin:flagSetEnabled',
      { name: 'quarterlyReports', enabled: false },
      { actor: actors.admin }
    )
    const killed = await scenario.when(
      'the guest opens the report',
      'invokesRpcRaw',
      { rpcName: REPORT },
      { actor: actors.guest }
    )
    await scenario.then(
      'it is off for them too',
      'expectsRpcResponse',
      { call: killed, status: 503 },
      { actor: actors.guest }
    )

    await scenario.do(
      'the operator opens it for the guest alone',
      'admin:flagSetOverride',
      {
        name: 'quarterlyReports',
        subject: { userId: guest.userId },
        enabled: true,
      },
      { actor: actors.admin }
    )
    const overridden = await scenario.when(
      'the guest opens the report again',
      'invokesRpcRaw',
      { rpcName: REPORT },
      { actor: actors.guest }
    )
    await scenario.then(
      'they see it while it stays off for everyone else',
      'expectsRpcResponse',
      { call: overridden, status: 200, contains: ['quarterly numbers'] },
      { actor: actors.guest }
    )

    await scenario.do(
      'the operator clears the override',
      'admin:flagClearOverride',
      { name: 'quarterlyReports', subject: { userId: guest.userId } },
      { actor: actors.admin }
    )
    const cleared = await scenario.when(
      'the guest opens the report once more',
      'invokesRpcRaw',
      { rpcName: REPORT },
      { actor: actors.guest }
    )
    await scenario.then(
      'they are back with everybody else',
      'expectsRpcResponse',
      { call: cleared, status: 503 },
      { actor: actors.guest }
    )

    await scenario.do(
      'the operator restores the feature',
      'admin:flagSetEnabled',
      { name: 'quarterlyReports', enabled: true },
      { actor: actors.admin }
    )
    return { restored: true }
  },
})

/**
 * `admin:flags:*` sits outside `platform-admin`, so staff is an administrator
 * who reaches the console and still cannot switch a feature off — the same
 * seam the audit trail draws, one tree over.
 */
export const flagsOperatorScopeIsTheGateScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'Administering flags takes its own scope',
  description: 'Reaching the console is not the same as holding the switch',
  tags: ['scenario', 'feature-flags'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the staff administrator kills a feature',
      'invokesRpcRaw',
      {
        rpcName: 'admin:flagSetEnabled',
        data: { name: 'bulkExport', enabled: false },
      },
      { actor: actors.staff }
    )
    await scenario.then(
      'they are refused, and told which scope they are missing',
      'expectsRpcResponse',
      { call, status: 403, contains: ['admin:flags:manage'] },
      { actor: actors.staff }
    )
    return { status: 403 }
  },
})

/**
 * The client wire, asked by a visitor with no session.
 *
 * It answers booleans and nothing else: sending `available` apart from
 * `capable` would tell every visitor which features exist but are dark. A flag
 * the caller cannot hold and a flag nobody has switched on are deliberately
 * indistinguishable from out here.
 */
export const flagsClientMapSendsOnlyShowScenario = pikkuScenario<
  void,
  { flags: Record<string, boolean> }
>({
  title: 'The client map is booleans, never the two halves behind them',
  description: 'A dark feature and an unheld one look the same to a visitor',
  tags: ['scenario', 'feature-flags'],
  func: async (_services, _data, { scenario }) => {
    const map = await scenario.when(
      'a signed-out visitor asks for its flags',
      'readsFeatureFlags',
      {}
    )

    await scenario.then(
      'a flag with no capability behind it is on, one they cannot hold is not, and neither is one nobody switched on',
      'expectsFlagMap',
      {
        map,
        show: {
          bulkExport: true,
          quarterlyReports: false,
          darkLaunch: false,
        },
      }
    )
    return { flags: map.flags }
  },
})

export const featureFlagsFeature = pikkuFeature({
  name: 'Feature flags',
  description:
    'Availability is enforced and capability is advisory, and the two are never collapsed',
  tags: ['feature-flags'],
  scenarios: [
    flagsAvailableFeatureIsReachableScenario,
    flagsDarkFeatureIsUnavailableScenario,
    flagsScopeRefusalComesFirstScenario,
    flagsKillSwitchClosesASessionlessPathScenario,
    flagsOverrideBeatsTheSwitchScenario,
    flagsOperatorScopeIsTheGateScenario,
    flagsClientMapSendsOnlyShowScenario,
  ],
})
