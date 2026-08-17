/**
 * The audit trail, end to end: a function marked `audit: true` records an
 * event, the sink persists it, `admin:getAudits` reads it back behind
 * `admin:audit:read`, and the console page renders it.
 *
 * `admin` holds `audit-reader` and nobody else does, so `staff` — an admin who
 * passes the console's own gate but holds no `pikku` scope — is the refused
 * case. That is the same seam the scopes console suite draws, and it is the one
 * that matters here: an audit trail readable by anyone signed in would be worse
 * than none, because it reads as governed when it is not.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const AUDIT_PAGE = '/console/audit'
const GET_AUDITS = 'admin:getAudits'

/** Distinct per scenario: the trail accumulates across a run. */
const RECORDED_TYPE = 'audit.e2e.recorded'
const FILTERED_TYPE = 'audit.e2e.filtered'
const DROPPED_TYPE = 'audit.e2e.dropped'
const BROWSED_TYPE = 'audit.e2e.browsed'

export const auditReadNeedsTheScopeScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'Reading the audit trail needs admin:audit:read',
  description:
    'An admin who holds no audit role is refused, not shown a stranger’s actions',
  tags: ['scenario', 'audit', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.staff) {
      throw new Error(
        'auditReadNeedsTheScopeScenario needs the staff actor — run via `pikku scenario run <environment>`'
      )
    }

    const call = await scenario.when(
      'staff reads the audit trail',
      'invokesRpcRaw',
      { rpcName: GET_AUDITS, data: { limit: 10 } },
      { actor: actors.staff }
    )
    await scenario.then(
      'sees it refused, naming the scope',
      'expectsRpcResponse',
      { call, status: 403, contains: ['admin:audit:read'] },
      { actor: actors.staff }
    )

    return { status: 403 }
  },
})

export const auditRecordsWhatHappenedScenario = pikkuScenario<
  void,
  { recorded: true }
>({
  title: 'An audited function’s event reaches the trail with its user',
  description:
    'The event is persisted with the type, the metadata and the caller who caused it',
  tags: ['scenario', 'audit', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'auditRecordsWhatHappenedScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.do(
      'records an audited action',
      'recordAuditEvent',
      { type: RECORDED_TYPE, entityId: 'inv-recorded' },
      { actor: actors.admin }
    )
    const call = await scenario.when(
      'reads the trail back',
      'invokesRpcRaw',
      { rpcName: GET_AUDITS, data: { types: [RECORDED_TYPE] } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the event, its metadata and who it was that acted',
      'expectsRpcResponse',
      {
        call,
        status: 200,
        contains: [
          RECORDED_TYPE,
          'inv-recorded',
          'recordAuditEvent',
          '"readable":true',
          // The trail stores an id; the address proves the read resolved it
          // against the user directory, which is what makes the page legible.
          'admin@actors.local',
        ],
      },
      { actor: actors.admin }
    )

    return { recorded: true }
  },
})

/**
 * The other half of the contract. `auditLog.write()` from a function that never
 * declared `audit: true` is dropped — without this the suite could not tell a
 * working sink from one that records whatever it is handed.
 */
export const auditIgnoresUnmarkedFunctionsScenario = pikkuScenario<
  void,
  { dropped: true }
>({
  title: 'A function that did not opt in records nothing',
  description: 'A write from an unmarked function never reaches the trail',
  tags: ['scenario', 'audit', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'auditIgnoresUnmarkedFunctionsScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.do(
      'writes from an unmarked function',
      'recordUnauditedEvent',
      { type: DROPPED_TYPE },
      { actor: actors.admin }
    )
    const call = await scenario.when(
      'looks for it in the trail',
      'invokesRpcRaw',
      { rpcName: GET_AUDITS, data: { types: [DROPPED_TYPE] } },
      { actor: actors.admin }
    )
    await scenario.then(
      'finds nothing',
      'expectsRpcResponse',
      { call, status: 200, contains: ['"events":[]'] },
      { actor: actors.admin }
    )

    return { dropped: true }
  },
})

export const auditFilterNarrowsTheTrailScenario = pikkuScenario<
  void,
  { filtered: true }
>({
  title: 'Filtering by action returns only that action',
  description:
    'The filter is applied by the sink, so it reaches events no page has loaded',
  tags: ['scenario', 'audit', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'auditFilterNarrowsTheTrailScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.do(
      'records the action being looked for',
      'recordAuditEvent',
      { type: FILTERED_TYPE, entityId: 'inv-filtered' },
      { actor: actors.admin }
    )
    await scenario.do(
      'records a different action',
      'recordAuditEvent',
      { type: `${FILTERED_TYPE}.other`, entityId: 'inv-other' },
      { actor: actors.admin }
    )
    const call = await scenario.when(
      'filters by the first action',
      'invokesRpcRaw',
      { rpcName: GET_AUDITS, data: { types: [FILTERED_TYPE] } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees only that one',
      'expectsRpcResponse',
      {
        call,
        status: 200,
        contains: ['inv-filtered'],
        doesNotContain: ['inv-other'],
      },
      { actor: actors.admin }
    )

    return { filtered: true }
  },
})

export const auditPageShowsTheEventScenario = pikkuScenario<
  void,
  { browsed: true }
>({
  title: 'The audit page lists the trail and opens an event in full',
  description:
    'A recorded event appears as a row, and the row opens its metadata',
  tags: ['scenario', 'audit', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'auditPageShowsTheEventScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.do(
      'records an audited action',
      'recordAuditEvent',
      { type: BROWSED_TYPE, entityId: 'inv-browsed' },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the audit page',
      'opensConsolePage',
      { path: AUDIT_PAGE, waitFor: { testId: 'audit-row' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the event as a row',
      'seesTestId',
      { testId: 'audit-row', atLeast: 1 },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the event',
      'clicksTestId',
      { testId: 'audit-row', containing: BROWSED_TYPE },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the event in full',
      'seesTestId',
      { testId: 'audit-detail' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees what the action changed',
      'seesText',
      { text: 'inv-browsed' },
      { actor: actors.admin }
    )
    // The persona's own name, not the id the event was recorded against: this
    // is the whole difference between a readable trail and a wall of opaque
    // identifiers, and it only holds if the read resolved the actor.
    await scenario.then(
      'sees who did it by name',
      'seesText',
      { text: 'Admin' },
      { actor: actors.admin }
    )

    return { browsed: true }
  },
})

/**
 * Refused is not broken. A caller without the scope must be told so, rather
 * than shown the load error a downed sink would produce — the two ask for
 * completely different things from whoever reads them.
 */
export const auditPageRefusalIsNotAnOutageScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'A caller without the audit scope is told so, not shown an outage',
  description:
    'The audit page separates "you may not read this" from "this could not be read"',
  tags: ['scenario', 'audit', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.staff) {
      throw new Error(
        'auditPageRefusalIsNotAnOutageScenario needs the staff actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the audit page as staff',
      'opensConsolePage',
      { path: AUDIT_PAGE, waitFor: { testId: 'audit-forbidden' } },
      { actor: actors.staff }
    )
    await scenario.then(
      'sees the permission alert',
      'seesTestId',
      { testId: 'audit-forbidden' },
      { actor: actors.staff }
    )
    await scenario.then(
      'is not told the trail failed to load',
      'doesNotSeeTestId',
      { testId: 'audit-error' },
      { actor: actors.staff }
    )

    return { refused: true }
  },
})

export const auditConsoleFeature = pikkuFeature({
  name: 'Audit Console',
  description: 'Recording, reading and browsing the audit trail',
  tags: ['console'],
  scenarios: [
    auditReadNeedsTheScopeScenario,
    auditRecordsWhatHappenedScenario,
    auditIgnoresUnmarkedFunctionsScenario,
    auditFilterNarrowsTheTrailScenario,
    auditPageShowsTheEventScenario,
    auditPageRefusalIsNotAnOutageScenario,
  ],
})
