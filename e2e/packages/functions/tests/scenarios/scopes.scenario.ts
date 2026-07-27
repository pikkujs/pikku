/**
 * A function declaring `scopes: ['reports:read']` is an AND gate resolved from
 * the session at the boundary, before the body is even parsed. A caller holding
 * the scope passes; an authenticated caller without it is refused with a 403
 * MissingScopeError that names the missing scope. Scopes narrow, never widen:
 * no passing permission or admin role can substitute for the declared scope.
 *
 * The e2e seed grants `report-viewer` (reports:read) to the `guest` actor and
 * the umbrella `admin` scope to the `admin` actor — so the admin is the
 * authenticated-but-unscoped caller for the reports gate.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const REPORT = 'getReport'
const SCOPE = 'reports:read'

export const scopesScopedCallerPassesScenario = pikkuScenario<
  void,
  { status: 200 }
>({
  title: 'A caller holding the scope reaches the function',
  description: 'The gate opens for a session that resolves the scope',
  tags: ['scenario', 'scopes'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the guest reads the report',
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

export const scopesUnscopedCallerIsRefusedScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'An authenticated caller without the scope is refused',
  description: 'The refusal names the scope that was missing',
  tags: ['scenario', 'scopes'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the admin reads the report',
      'invokesRpcRaw',
      { rpcName: REPORT },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees a MissingScopeError naming the scope',
      'expectsRpcResponse',
      { call, status: 403, contains: ['MissingScopeError', SCOPE] },
      { actor: actors.admin }
    )
    return { status: 403 }
  },
})

/**
 * A scope granted directly to a user — with no role involved — resolves onto
 * their session at the boundary and opens the gate on the next request, no
 * re-login. Revoking it closes the gate again, which is why the scenario ends
 * with the admin back at its seeded (unscoped-for-reports) state.
 */
export const scopesDirectGrantOpensTheGateScenario = pikkuScenario<
  void,
  { restored: true }
>({
  title: 'A scope granted directly to a user opens the gate without a role',
  description: 'And revoking it closes the gate again, with no re-login',
  tags: ['scenario', 'scopes'],
  func: async (_services, _data, { scenario, actors }) => {
    const admin = await scenario.given(
      'the admin reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.admin }
    )

    const before = await scenario.when(
      'reads the report unscoped',
      'invokesRpcRaw',
      { rpcName: REPORT },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it refused',
      'expectsRpcResponse',
      { call: before, status: 403 },
      { actor: actors.admin }
    )

    await scenario.do(
      'grants the scope directly',
      'console:scopeAddScopeToUser',
      { userId: admin.userId, scope: SCOPE },
      { actor: actors.admin }
    )
    const granted = await scenario.when(
      'reads the report scoped',
      'invokesRpcRaw',
      { rpcName: REPORT },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the report',
      'expectsRpcResponse',
      { call: granted, status: 200, contains: ['quarterly numbers'] },
      { actor: actors.admin }
    )

    await scenario.do(
      'revokes the scope',
      'console:scopeRemoveScopeFromUser',
      { userId: admin.userId, scope: SCOPE },
      { actor: actors.admin }
    )
    const revoked = await scenario.when(
      'reads the report again',
      'invokesRpcRaw',
      { rpcName: REPORT },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it refused once more',
      'expectsRpcResponse',
      { call: revoked, status: 403 },
      { actor: actors.admin }
    )
    return { restored: true }
  },
})

export const scopesFeature = pikkuFeature({
  name: 'Scope gate on functions',
  description:
    'A declared scope is an AND gate resolved from the session at the boundary',
  tags: ['scopes'],
  scenarios: [
    scopesScopedCallerPassesScenario,
    scopesUnscopedCallerIsRefusedScenario,
    scopesDirectGrantOpensTheGateScenario,
  ],
})
