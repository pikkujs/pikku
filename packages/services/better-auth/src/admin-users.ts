import type { BetterAuthInstance } from './define-auth.js'

export type AuthGetter = (() => Promise<BetterAuthInstance>) | undefined

/**
 * User administration against better-auth's internal adapter.
 *
 * These are the capabilities better-auth's `admin()` plugin exposed as HTTP
 * endpoints, reimplemented as plain calls so pikku can drop that plugin. The
 * endpoints were never reachable directly — every one sat behind a pikku
 * function with its own `admin:users:*` scope — so all `admin()` contributed
 * was a second gate on `user.role`, a column that had to be projected from the
 * scopes it was checked against. Removing it removes the projection with it,
 * and leaves the scope on each function as the single decision about who may do
 * this.
 *
 * They live in this package rather than in `@pikku/addon-admin` so the addon
 * and the `scaffold.userAdmin` generator share one implementation, and so a host
 * can drive the same operations from its own hand-written functions.
 *
 * Ban state is written here but enforced by the {@link ban} plugin, which must
 * be wired for the columns to exist.
 */
const context = async (auth: AuthGetter) => {
  if (!auth) {
    throw new Error(
      'User management requires better-auth to be wired (services.auth is missing)'
    )
  }
  return (await auth()).$context as any
}

const assertPasswordLength = (ctx: any, password: string) => {
  const { minPasswordLength, maxPasswordLength } = ctx.password.config
  if (password.length < minPasswordLength) {
    throw new Error(`Password must be at least ${minPasswordLength} characters`)
  }
  if (password.length > maxPasswordLength) {
    throw new Error(`Password must be at most ${maxPasswordLength} characters`)
  }
}

/**
 * Create a user out of band, with a credential account when a password is
 * given. Refuses an email that is already taken.
 */
export const createAuthUser = async (
  auth: AuthGetter,
  { email, password, name }: { email: string; password?: string; name?: string }
): Promise<string> => {
  const ctx = await context(auth)
  const normalized = email.toLowerCase()
  if (password) {
    assertPasswordLength(ctx, password)
  }
  if (await ctx.internalAdapter.findUserByEmail(normalized)) {
    throw new Error('A user with that email already exists')
  }

  const user = await ctx.internalAdapter.createUser({
    email: normalized,
    name: name ?? normalized,
    emailVerified: false,
  })
  if (!user) {
    throw new Error('Failed to create user')
  }

  if (password) {
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      accountId: user.id,
      providerId: 'credential',
      password: await ctx.password.hash(password),
    })
  }

  return user.id
}

/**
 * Set a user's password, creating their credential account if they signed up
 * through a social provider and never had one.
 */
export const setAuthUserPassword = async (
  auth: AuthGetter,
  { userId, newPassword }: { userId: string; newPassword: string }
): Promise<void> => {
  const ctx = await context(auth)
  assertPasswordLength(ctx, newPassword)
  if (!(await ctx.internalAdapter.findUserById(userId))) {
    throw new Error('User not found')
  }

  const hashed = await ctx.password.hash(newPassword)
  const accounts = await ctx.internalAdapter.findAccounts(userId)
  if (accounts.some((account: any) => account.providerId === 'credential')) {
    await ctx.internalAdapter.updatePassword(userId, hashed)
  } else {
    await ctx.internalAdapter.createAccount({
      userId,
      accountId: userId,
      providerId: 'credential',
      password: hashed,
    })
  }
}

/**
 * Ban or unban a user. Banning also signs them out everywhere, so the ban takes
 * effect immediately rather than when their current session expires.
 */
export const setAuthUserBanned = async (
  auth: AuthGetter,
  {
    userId,
    banned,
    reason,
    expiresInSeconds,
  }: {
    userId: string
    banned: boolean
    reason?: string
    expiresInSeconds?: number
  }
): Promise<void> => {
  const ctx = await context(auth)
  if (!(await ctx.internalAdapter.findUserById(userId))) {
    throw new Error('User not found')
  }

  if (!banned) {
    await ctx.internalAdapter.updateUser(userId, {
      banned: false,
      banReason: null,
      banExpires: null,
    })
    return
  }

  await ctx.internalAdapter.updateUser(userId, {
    banned: true,
    banReason: reason ?? 'No reason',
    banExpires: expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : null,
  })
  await ctx.internalAdapter.deleteUserSessions(userId)
}

/** Delete a user along with their sessions and linked accounts. */
export const deleteAuthUser = async (
  auth: AuthGetter,
  userId: string
): Promise<void> => {
  const ctx = await context(auth)
  if (!(await ctx.internalAdapter.findUserById(userId))) {
    throw new Error('User not found')
  }
  await ctx.internalAdapter.deleteUser(userId)
}

/** Sign a user out of every device, leaving the account intact. */
export const revokeAuthUserSessions = async (
  auth: AuthGetter,
  userId: string
): Promise<void> => {
  const ctx = await context(auth)
  await ctx.internalAdapter.deleteUserSessions(userId)
}
