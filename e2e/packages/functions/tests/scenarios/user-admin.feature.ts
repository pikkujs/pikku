/**
 * Banning, deleting, signing out and password-setting are implemented by
 * better-auth's `admin()` plugin, but pikku exposes them as scaffolded functions
 * in the host app — no console required — each gated on its own
 * `admin:users:*` scope.
 *
 * Those endpoints authorize on better-auth's own `user.role`, which pikku never
 * grants directly: it is projected from the scope store at the session boundary.
 * A caller holding a user-management scope is `role: 'admin'` to better-auth; a
 * caller who is not, is not. That makes the scopes the single source of truth
 * and these scenarios the proof that the projection actually reaches the plugin.
 *
 * The `admin` actor holds the umbrella `admin` scope, which covers every
 * `admin:users:*` leaf by pikku's parent-grant rule. The `guest` actor holds
 * only `report-viewer`. The subject is the seeded `target@e2e.test` person
 * rather than the `target` actor, because the ban has to be proven against a
 * real password sign-in — which is a thing only a person has.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'
import { TARGET_USER } from '../../../../src/auth-fixtures.js'

const BAN = 'pikkuAdminSetUserBanned'
const REMOVE = 'pikkuAdminRemoveUser'
const SESSIONS = 'pikkuAdminRevokeUserSessions'
const PASSWORD = 'pikkuAdminSetUserPassword'

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
 * The end-to-end proof of the projection: the ban only lands because the
 * caller's scopes made them `role: 'admin'` to better-auth's own gate. The
 * scenario lifts the ban again so the target is left as it was found.
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
 * Reading the directory must not confer the power to change it: the role is
 * projected from the user-management subtree only, never from `users:list`.
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
      'console:scopeAddScopeToUser',
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
      'console:scopeRemoveScopeFromUser',
      { userId: guest.userId, scope: 'admin:users:list' },
      { actor: actors.admin }
    )
    return { restored: true }
  },
})

export const userAdminFeature = pikkuFeature({
  name: 'Scaffolded user management',
  description:
    'Each admin:users:* capability is gated on its own scope, projected onto better-auth',
  tags: ['user-admin'],
  scenarios: [
    userAdminUnscopedCannotBanScenario,
    userAdminUnscopedCannotDeleteScenario,
    userAdminUnscopedCannotRevokeSessionsScenario,
    userAdminUnscopedCannotSetPasswordScenario,
    userAdminScopedBanBlocksSignInScenario,
    userAdminScopedRevokesSessionsScenario,
    userAdminListScopeDoesNotConferBanScenario,
  ],
})
