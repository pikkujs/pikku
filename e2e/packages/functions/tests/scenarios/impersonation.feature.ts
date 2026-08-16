/**
 * The impersonation header is honoured only for a caller whose resolved scopes
 * satisfy `admin:impersonate`. There is no `role === 'admin'` fallback and no
 * self-service escalation: an unauthorized caller sending the same header is
 * silently ignored and keeps running as themselves, so a forged header can
 * never widen access.
 *
 * `whoAmI` echoes the session the request actually ran under, which is what
 * makes the difference observable without a browser.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const IMPERSONATE_HEADER = 'x-pikku-impersonate-user-id'
const SCOPE = 'admin:impersonate'

export const impersonationScopedCallerRunsAsTargetScenario = pikkuScenario<
  void,
  { impersonated: true }
>({
  title: 'A caller holding the scope runs as the target',
  description: 'The header is honoured and whoAmI echoes the target',
  tags: ['scenario', 'impersonation'],
  func: async (_services, _data, { scenario, actors }) => {
    const guest = await scenario.given(
      'the guest reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.guest }
    )
    const call = await scenario.when(
      'the admin calls whoAmI as the guest',
      'invokesRpcRaw',
      {
        rpcName: 'whoAmI',
        headers: { [IMPERSONATE_HEADER]: guest.userId },
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the run report the guest',
      'expectsRpcResponse',
      { call, status: 200, contains: [guest.userId] },
      { actor: actors.admin }
    )
    return { impersonated: true }
  },
})

export const impersonationForgedHeaderIsIgnoredScenario = pikkuScenario<
  void,
  { escalated: false }
>({
  title: 'A caller without the scope cannot escalate by forging the header',
  description: 'The header is ignored and the caller keeps running as itself',
  tags: ['scenario', 'impersonation'],
  func: async (_services, _data, { scenario, actors }) => {
    const admin = await scenario.given(
      'the admin reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.admin }
    )
    const guest = await scenario.given(
      'the guest reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.guest }
    )
    const call = await scenario.when(
      'the guest forges the header',
      'invokesRpcRaw',
      {
        rpcName: 'whoAmI',
        headers: { [IMPERSONATE_HEADER]: admin.userId },
      },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees the run still report the guest',
      'expectsRpcResponse',
      {
        call,
        status: 200,
        contains: [guest.userId],
        doesNotContain: [admin.userId],
      },
      { actor: actors.guest }
    )
    return { escalated: false }
  },
})

/**
 * The scope itself is the gate, not the identity: granting it to the guest
 * opens impersonation on the next request and revoking it closes it again,
 * leaving the guest back in its seeded state.
 */
export const impersonationScopeIsTheGateScenario = pikkuScenario<
  void,
  { restored: true }
>({
  title: 'Granting admin:impersonate opens the gate, revoking it closes it',
  description: 'The gate follows the scope, not the person',
  tags: ['scenario', 'impersonation'],
  func: async (_services, _data, { scenario, actors }) => {
    const admin = await scenario.given(
      'the admin reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.admin }
    )
    const guest = await scenario.given(
      'the guest reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.guest }
    )

    const before = await scenario.when(
      'the guest forges the header',
      'invokesRpcRaw',
      { rpcName: 'whoAmI', headers: { [IMPERSONATE_HEADER]: admin.userId } },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it ignored',
      'expectsRpcResponse',
      { call: before, status: 200, contains: [guest.userId] },
      { actor: actors.guest }
    )

    await scenario.do(
      'grants admin:impersonate to the guest',
      'console:scopeAddScopeToUser',
      { userId: guest.userId, scope: SCOPE },
      { actor: actors.admin }
    )
    const granted = await scenario.when(
      'the guest impersonates the admin',
      'invokesRpcRaw',
      { rpcName: 'whoAmI', headers: { [IMPERSONATE_HEADER]: admin.userId } },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees the run report the admin',
      'expectsRpcResponse',
      { call: granted, status: 200, contains: [admin.userId] },
      { actor: actors.guest }
    )

    await scenario.do(
      'revokes the scope',
      'console:scopeRemoveScopeFromUser',
      { userId: guest.userId, scope: SCOPE },
      { actor: actors.admin }
    )
    const revoked = await scenario.when(
      'the guest tries once more',
      'invokesRpcRaw',
      { rpcName: 'whoAmI', headers: { [IMPERSONATE_HEADER]: admin.userId } },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it ignored again',
      'expectsRpcResponse',
      { call: revoked, status: 200, contains: [guest.userId] },
      { actor: actors.guest }
    )
    return { restored: true }
  },
})

export const impersonationFeature = pikkuFeature({
  name: 'Impersonation is gated on the admin:impersonate scope',
  description:
    'A forged header can never widen access — the scope is the only gate',
  tags: ['impersonation'],
  scenarios: [
    impersonationScopedCallerRunsAsTargetScenario,
    impersonationForgedHeaderIsIgnoredScenario,
    impersonationScopeIsTheGateScenario,
  ],
})
