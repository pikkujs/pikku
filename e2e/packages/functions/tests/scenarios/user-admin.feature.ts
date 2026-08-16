/**
 * User management over RPC — no console required — each capability gated on its
 * own `admin:users:*` scope.
 *
 * The scope on the function is the whole authorization decision. These drive
 * better-auth's internal adapter directly, so there is no second gate on a
 * `user.role` column behind them, and these scenarios are the proof that the
 * one gate that remains actually holds.
 *
 * Two surfaces ship the same capabilities: the `scaffold.userAdmin` functions a
 * host generates, and `@pikku/addon-admin`. The refusal scenarios below use
 * whichever surface names the scope most directly; the lifecycle uses the addon,
 * because the console — and so `user-admin-console.feature.ts` — can only reach
 * the scaffold, and neither surface should be left to the other's word.
 *
 * The `admin` actor holds the umbrella `admin` scope, which covers every
 * `admin:users:*` leaf by pikku's parent-grant rule. The `guest` actor holds
 * only `report-viewer`. The subject is the seeded `target@e2e.test` person
 * rather than the `target` actor, because the ban has to be proven against a
 * real password sign-in — which is a thing only a person has.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'
import { TARGET_USER } from '../../../../src/auth-fixtures.js'

const BAN = 'pikkuAdminSetUserBanned'
const REMOVE = 'pikkuAdminRemoveUser'
const SESSIONS = 'pikkuAdminRevokeUserSessions'
const PASSWORD = 'pikkuAdminSetUserPassword'

/**
 * The same capabilities as shipped by `@pikku/addon-admin`.
 *
 * Both surfaces call one implementation in `@pikku/better-auth`, but they are
 * wired differently — the addon resolves its own services and unions its scopes
 * with each function's — and only the scaffold is reachable from the console.
 * So the addon is proven here, over RPC, and the scaffold in the browser by
 * `user-admin-console.feature.ts`. Neither surface is left to the other's word.
 */
const ADDON_LIST = 'admin:listUsers'
const ADDON_CREATE = 'admin:createUser'
const ADDON_BAN = 'admin:setUserBanned'
const ADDON_REMOVE = 'admin:removeUser'
const ADDON_SESSIONS = 'admin:revokeUserSessions'
const ADDON_PASSWORD = 'admin:setUserPassword'

const NEW_USER = {
  email: 'api-lifecycle@e2e.test',
  password: 'api-lifecycle-pass',
  rotated: 'api-lifecycle-rotated',
}

export const userAdminUnscopedCannotBanScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'A caller without the scope cannot ban',
  description: 'The refusal names admin:users:ban',
  tags: ['scenario', 'user-admin'],
  func: async (_services, _data, { scenario, actors }) => {
    const target = await scenario.given(
      'the admin resolves the target',
      'readsUserIdByEmail',
      { email: TARGET_USER.email },
      { actor: actors.admin }
    )
    const call = await scenario.when(
      'the guest bans the target',
      'invokesRpcRaw',
      { rpcName: BAN, data: { userId: target.userId, banned: true } },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it refused',
      'expectsRpcResponse',
      { call, status: 403, contains: ['MissingScopeError', 'admin:users:ban'] },
      { actor: actors.guest }
    )
    return { status: 403 }
  },
})

export const userAdminUnscopedCannotDeleteScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'A caller without the scope cannot delete',
  description: 'The refusal names admin:users:remove',
  tags: ['scenario', 'user-admin'],
  func: async (_services, _data, { scenario, actors }) => {
    const target = await scenario.given(
      'the admin resolves the target',
      'readsUserIdByEmail',
      { email: TARGET_USER.email },
      { actor: actors.admin }
    )
    const call = await scenario.when(
      'the guest deletes the target',
      'invokesRpcRaw',
      { rpcName: REMOVE, data: { userId: target.userId } },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it refused',
      'expectsRpcResponse',
      { call, status: 403, contains: ['admin:users:remove'] },
      { actor: actors.guest }
    )
    return { status: 403 }
  },
})

export const userAdminUnscopedCannotRevokeSessionsScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'A caller without the scope cannot revoke sessions',
  description: 'The refusal names admin:users:sessions',
  tags: ['scenario', 'user-admin'],
  func: async (_services, _data, { scenario, actors }) => {
    const target = await scenario.given(
      'the admin resolves the target',
      'readsUserIdByEmail',
      { email: TARGET_USER.email },
      { actor: actors.admin }
    )
    const call = await scenario.when(
      'the guest signs the target out everywhere',
      'invokesRpcRaw',
      { rpcName: SESSIONS, data: { userId: target.userId } },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it refused',
      'expectsRpcResponse',
      { call, status: 403, contains: ['admin:users:sessions'] },
      { actor: actors.guest }
    )
    return { status: 403 }
  },
})

export const userAdminUnscopedCannotSetPasswordScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'A caller without the scope cannot set a password',
  description: 'The refusal names admin:users:password',
  tags: ['scenario', 'user-admin'],
  func: async (_services, _data, { scenario, actors }) => {
    const target = await scenario.given(
      'the admin resolves the target',
      'readsUserIdByEmail',
      { email: TARGET_USER.email },
      { actor: actors.admin }
    )
    const call = await scenario.when(
      'the guest sets the password of the target',
      'invokesRpcRaw',
      {
        rpcName: PASSWORD,
        data: { userId: target.userId, newPassword: 'guest-set-password' },
      },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it refused',
      'expectsRpcResponse',
      { call, status: 403, contains: ['admin:users:password'] },
      { actor: actors.guest }
    )
    return { status: 403 }
  },
})

/**
 * The end-to-end proof that a ban reaches better-auth: the RPC's own scope is
 * the only gate, and what the `ban()` plugin writes is what refuses the sign-in.
 * The scenario lifts the ban again so the target is left as it was found.
 */
export const userAdminScopedBanBlocksSignInScenario = pikkuScenario<
  void,
  { restored: true }
>({
  title: 'A scoped caller bans a user, blocking sign-in, then lifts it',
  description: 'The ban reaches better-auth and a real sign-in is refused',
  tags: ['scenario', 'user-admin'],
  func: async (_services, _data, { scenario, actors }) => {
    const target = await scenario.given(
      'the admin resolves the target',
      'readsUserIdByEmail',
      { email: TARGET_USER.email },
      { actor: actors.admin }
    )

    const banned = await scenario.when(
      'the admin bans the target',
      'invokesRpcRaw',
      {
        rpcName: BAN,
        data: { userId: target.userId, banned: true, reason: 'e2e' },
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the ban accepted',
      'expectsRpcResponse',
      { call: banned, status: 200 },
      { actor: actors.admin }
    )
    const blocked = await scenario.when(
      'the target tries to sign in',
      'attemptsSignIn',
      { email: TARGET_USER.email, password: TARGET_USER.password }
    )
    await scenario.then('sees it refused', 'expectsSignIn', {
      attempt: blocked,
      accepted: false,
    })

    const lifted = await scenario.when(
      'the admin unbans the target',
      'invokesRpcRaw',
      { rpcName: BAN, data: { userId: target.userId, banned: false } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the ban lifted',
      'expectsRpcResponse',
      { call: lifted, status: 200 },
      { actor: actors.admin }
    )
    const allowed = await scenario.when(
      'the target tries again',
      'attemptsSignIn',
      { email: TARGET_USER.email, password: TARGET_USER.password }
    )
    await scenario.then('sees it accepted', 'expectsSignIn', {
      attempt: allowed,
      accepted: true,
    })
    return { restored: true }
  },
})

export const userAdminScopedRevokesSessionsScenario = pikkuScenario<
  void,
  { status: 200 }
>({
  title: 'A scoped caller signs a user out everywhere',
  description: 'The session revocation reaches better-auth',
  tags: ['scenario', 'user-admin'],
  func: async (_services, _data, { scenario, actors }) => {
    const target = await scenario.given(
      'the admin resolves the target',
      'readsUserIdByEmail',
      { email: TARGET_USER.email },
      { actor: actors.admin }
    )
    const call = await scenario.when(
      'the admin signs the target out everywhere',
      'invokesRpcRaw',
      { rpcName: SESSIONS, data: { userId: target.userId } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it accepted',
      'expectsRpcResponse',
      { call, status: 200 },
      { actor: actors.admin }
    )
    return { status: 200 }
  },
})

/**
 * Reading the directory must not confer the power to change it. Each capability
 * carries its own leaf, and `users:list` is not a parent of `users:ban`.
 */
export const userAdminListScopeDoesNotConferBanScenario = pikkuScenario<
  void,
  { restored: true }
>({
  title: 'Holding only the list scope does not confer ban',
  description: 'admin:users:list is not a licence to ban',
  tags: ['scenario', 'user-admin'],
  func: async (_services, _data, { scenario, actors }) => {
    const target = await scenario.given(
      'the admin resolves the target',
      'readsUserIdByEmail',
      { email: TARGET_USER.email },
      { actor: actors.admin }
    )
    const guest = await scenario.given(
      'the guest reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.guest }
    )

    await scenario.do(
      'grants admin:users:list to the guest',
      'admin:scopeAddScopeToUser',
      { userId: guest.userId, scope: 'admin:users:list' },
      { actor: actors.admin }
    )
    const call = await scenario.when(
      'the guest bans the target',
      'invokesRpcRaw',
      { rpcName: BAN, data: { userId: target.userId, banned: true } },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it refused',
      'expectsRpcResponse',
      { call, status: 403, contains: ['admin:users:ban'] },
      { actor: actors.guest }
    )
    await scenario.do(
      'revokes the scope',
      'admin:scopeRemoveScopeFromUser',
      { userId: guest.userId, scope: 'admin:users:list' },
      { actor: actors.admin }
    )
    return { restored: true }
  },
})

export const userAdminUnscopedCannotCreateScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'A caller without the scope cannot create a user',
  description: 'The refusal names admin:users:create',
  tags: ['scenario', 'user-admin'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the guest creates a user',
      'invokesRpcRaw',
      {
        rpcName: ADDON_CREATE,
        data: { email: 'never-created@e2e.test', password: 'never-created' },
      },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it refused',
      'expectsRpcResponse',
      {
        call,
        status: 403,
        contains: ['admin:users:create'],
      },
      { actor: actors.guest }
    )
    return { status: 403 }
  },
})

/**
 * The whole lifecycle over RPC, against the addon.
 *
 * One scenario because the steps are sequential — a password cannot be rotated
 * on a user who has not been created, and a delete cannot be proven without one
 * to delete. Each write is checked against the only thing that cannot be faked:
 * whether the user can actually sign in, and with which password.
 *
 * It ends by deleting the user it made, so a re-run starts where the last one
 * did rather than colliding with its own leftovers.
 */
export const userAdminApiLifecycleScenario = pikkuScenario<
  void,
  { lifecycle: true }
>({
  title: 'The full lifecycle of a user, driven over RPC',
  description:
    'Create, sign in, rotate the password, revoke sessions and delete, through @pikku/addon-admin',
  tags: ['scenario', 'user-admin'],
  func: async (_services, _data, { scenario, actors }) => {
    const created = await scenario.when(
      'the admin creates a user',
      'invokesRpcRaw',
      {
        rpcName: ADDON_CREATE,
        data: { email: NEW_USER.email, password: NEW_USER.password },
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it accepted',
      'expectsRpcResponse',
      { call: created, status: 200 },
      { actor: actors.admin }
    )

    // Resolving through the directory proves two things at once: the row landed,
    // and it landed as a person rather than something isPerson filters out.
    const target = await scenario.given(
      'the admin resolves the new user',
      'readsUserIdByEmail',
      { email: NEW_USER.email },
      { actor: actors.admin }
    )

    // A user created without a credential account exists but can never sign in,
    // which is exactly the failure a create that skipped linkAccount produces.
    const firstSignIn = await scenario.when(
      'the new user signs in',
      'attemptsSignIn',
      { email: NEW_USER.email, password: NEW_USER.password }
    )
    await scenario.then('sees it accepted', 'expectsSignIn', {
      attempt: firstSignIn,
      accepted: true,
    })

    const duplicate = await scenario.when(
      'the admin creates the same email again',
      'invokesRpcRaw',
      {
        rpcName: ADDON_CREATE,
        data: { email: NEW_USER.email, password: NEW_USER.password },
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the duplicate refused',
      'expectsRpcResponse',
      { call: duplicate, contains: ['already exists'] },
      { actor: actors.admin }
    )

    const banned = await scenario.when(
      'the admin bans the new user',
      'invokesRpcRaw',
      {
        rpcName: ADDON_BAN,
        data: { userId: target.userId, banned: true, reason: 'e2e' },
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the ban accepted',
      'expectsRpcResponse',
      { call: banned, status: 200 },
      { actor: actors.admin }
    )
    const blocked = await scenario.when(
      'the banned user tries to sign in',
      'attemptsSignIn',
      { email: NEW_USER.email, password: NEW_USER.password }
    )
    await scenario.then('sees it refused', 'expectsSignIn', {
      attempt: blocked,
      accepted: false,
    })

    const lifted = await scenario.when(
      'the admin lifts the ban',
      'invokesRpcRaw',
      { rpcName: ADDON_BAN, data: { userId: target.userId, banned: false } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the ban lifted',
      'expectsRpcResponse',
      { call: lifted, status: 200 },
      { actor: actors.admin }
    )

    const rotation = await scenario.when(
      'the admin rotates the password',
      'invokesRpcRaw',
      {
        rpcName: ADDON_PASSWORD,
        data: { userId: target.userId, newPassword: NEW_USER.rotated },
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the rotation accepted',
      'expectsRpcResponse',
      { call: rotation, status: 200 },
      { actor: actors.admin }
    )
    // Both halves matter: a rotation that added a second credential account
    // instead of updating the first leaves the old password working.
    const withOld = await scenario.when(
      'the user tries the old password',
      'attemptsSignIn',
      { email: NEW_USER.email, password: NEW_USER.password }
    )
    await scenario.then('sees it refused', 'expectsSignIn', {
      attempt: withOld,
      accepted: false,
    })
    const withNew = await scenario.when(
      'the user tries the new password',
      'attemptsSignIn',
      { email: NEW_USER.email, password: NEW_USER.rotated }
    )
    await scenario.then('sees it accepted', 'expectsSignIn', {
      attempt: withNew,
      accepted: true,
    })

    const revoked = await scenario.when(
      'the admin signs the user out everywhere',
      'invokesRpcRaw',
      { rpcName: ADDON_SESSIONS, data: { userId: target.userId } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it accepted',
      'expectsRpcResponse',
      { call: revoked, status: 200 },
      { actor: actors.admin }
    )
    // Revoking sessions is not a ban — the account survives it.
    const afterRevoke = await scenario.when(
      'the user signs in again',
      'attemptsSignIn',
      { email: NEW_USER.email, password: NEW_USER.rotated }
    )
    await scenario.then('sees it accepted', 'expectsSignIn', {
      attempt: afterRevoke,
      accepted: true,
    })

    const removed = await scenario.when(
      'the admin deletes the user',
      'invokesRpcRaw',
      { rpcName: ADDON_REMOVE, data: { userId: target.userId } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it accepted',
      'expectsRpcResponse',
      { call: removed, status: 200 },
      { actor: actors.admin }
    )
    const afterDelete = await scenario.when(
      'the deleted user tries to sign in',
      'attemptsSignIn',
      { email: NEW_USER.email, password: NEW_USER.rotated }
    )
    await scenario.then('sees it refused', 'expectsSignIn', {
      attempt: afterDelete,
      accepted: false,
    })

    return { lifecycle: true }
  },
})

/**
 * An administrator cannot lock themselves out.
 *
 * These two guards used to belong to better-auth's `admin()` routes, which knew
 * the caller. Dropping the plugin moved them onto the pikku functions — the only
 * layer that still knows who is asking — so they are worth proving where they
 * now live.
 */
export const userAdminCannotActOnSelfScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'An administrator cannot ban or delete themselves',
  description: 'The self-guards survived the move off better-auth admin()',
  tags: ['scenario', 'user-admin'],
  func: async (_services, _data, { scenario, actors }) => {
    const me = await scenario.given(
      'the admin reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.admin }
    )

    const selfBan = await scenario.when(
      'the admin bans itself',
      'invokesRpcRaw',
      { rpcName: ADDON_BAN, data: { userId: me.userId, banned: true } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it refused',
      'expectsRpcResponse',
      { call: selfBan, contains: ['cannot ban yourself'] },
      { actor: actors.admin }
    )

    const selfDelete = await scenario.when(
      'the admin deletes itself',
      'invokesRpcRaw',
      { rpcName: ADDON_REMOVE, data: { userId: me.userId } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it refused',
      'expectsRpcResponse',
      { call: selfDelete, contains: ['cannot delete yourself'] },
      { actor: actors.admin }
    )

    // The refusals must have been refusals, not a delete that half-happened.
    // Read-only on purpose: revoking the admin's own sessions to prove the
    // point would sign it out of every scenario that runs after this one.
    const stillThere = await scenario.when(
      'the admin reads the directory',
      'invokesRpcRaw',
      { rpcName: ADDON_LIST, data: {} },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the call accepted',
      'expectsRpcResponse',
      { call: stillThere, status: 200 },
      { actor: actors.admin }
    )

    return { refused: true }
  },
})

export const userAdminFeature = pikkuFeature({
  name: 'User management',
  description:
    'Each admin:users:* capability is gated on its own scope, and that scope is the only gate',
  tags: ['user-admin'],
  scenarios: [
    userAdminUnscopedCannotBanScenario,
    userAdminUnscopedCannotDeleteScenario,
    userAdminUnscopedCannotRevokeSessionsScenario,
    userAdminUnscopedCannotSetPasswordScenario,
    userAdminUnscopedCannotCreateScenario,
    userAdminScopedBanBlocksSignInScenario,
    userAdminScopedRevokesSessionsScenario,
    userAdminListScopeDoesNotConferBanScenario,
    userAdminApiLifecycleScenario,
    userAdminCannotActOnSelfScenario,
  ],
})
