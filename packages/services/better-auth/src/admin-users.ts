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
 * They live in this package rather than in `@pikku/addon-admin` so a host can
 * drive the same operations from its own hand-written functions without taking
 * the addon. They were also what the retired `scaffold.userAdmin` generator
 * called, which is why the addon that replaced it needed no new implementation.
 *
 * Ban state is written here but enforced by the {@link ban} plugin, which must
 * be wired for the columns to exist.
 */
/**
 * The issuer better-auth stamps on accounts from providers that have none of
 * their own, for the versions that have the column.
 *
 * From 1.7 a credential account is looked up by its issuer as well as its
 * provider — sign-in, `updatePassword` and `findCredentialAccount` all filter on
 * it — so an account written without one is invisible to every path that would
 * use it, and a user who plainly exists is reported as not found. Before 1.7 the
 * column does not exist and writing it fails the insert, so the field is
 * included only when the resolved schema has it.
 *
 * The value is better-auth's own encoding rather than its exported helper: the
 * helper does not exist in the versions this package still supports.
 */
const CREDENTIAL_ISSUER = 'local:credential'

const credentialIssuerFields = (ctx: any): { issuer?: string } =>
  ctx.tables?.account?.fields?.issuer ? { issuer: CREDENTIAL_ISSUER } : {}

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
 *
 * A supplied password is checked against the configured policy even when it is
 * empty — `''` is a password the caller chose, not an omitted one, and the
 * account it would create can never be signed into.
 *
 * The user row and its credential account are two writes with no transaction
 * across them, so a failed link deletes the user it was for. Without that, the
 * caller is left with a passwordless user and every retry fails on the
 * duplicate email instead.
 */
export const createAuthUser = async (
  auth: AuthGetter,
  { email, password, name }: { email: string; password?: string; name?: string }
): Promise<string> => {
  const ctx = await context(auth)
  const normalized = email.toLowerCase()
  if (password !== undefined) {
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

  if (password !== undefined) {
    try {
      await ctx.internalAdapter.linkAccount({
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        ...credentialIssuerFields(ctx),
        password: await ctx.password.hash(password),
      })
    } catch (error) {
      try {
        await ctx.internalAdapter.deleteUser(user.id)
      } catch (cleanupError) {
        throw new Error(
          `Linking the credential account failed and user ${user.id} could not be removed: it has no password and its email is now taken`,
          { cause: cleanupError }
        )
      }
      throw error
    }
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
  const credential = accounts.find(
    (account: any) => account.providerId === 'credential'
  )
  if (credential) {
    const issuerFields = credentialIssuerFields(ctx)
    if (issuerFields.issuer && credential.issuer !== issuerFields.issuer) {
      await ctx.internalAdapter.updateAccount(credential.id, issuerFields)
    }
    await ctx.internalAdapter.updatePassword(userId, hashed)
  } else {
    await ctx.internalAdapter.createAccount({
      userId,
      accountId: userId,
      providerId: 'credential',
      ...credentialIssuerFields(ctx),
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
