import { pikkuFunc } from '#pikku/addon/function'
import { createAuthUser, sendAuthUserSignInLink } from '@pikku/better-auth'
import { BadRequestError, MissingServiceError } from '@pikku/core/errors'
import { verifyScopes } from '@pikku/core/scope'
import {
  InviteMailFailedError,
  InviteUnknownRoleError,
  InviteUserBannedError,
} from '../lib/invite-errors.js'
import { InviteUserInput, InviteUserOutput } from '../lib/user.schemas.js'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The `pikkuBan()` rule: a ban with an expiry in the past has lapsed. */
const isBanned = (user: {
  banned?: boolean | null
  banExpires?: Date | string | null
}) =>
  user.banned === true &&
  (!user.banExpires || new Date(user.banExpires).getTime() > Date.now())

export const inviteUser = pikkuFunc({
  title: 'Invite User',
  description:
    'Invites someone by email: creates the account without a password when there is none, mails a sign-in link, then grants `role` if one is given. Calling it again for the same email sends a new link. Requires the magicLink plugin with sign-up disabled; granting a role also requires admin:scopes:manage.',
  tags: ['admin:users'],
  expose: true,
  // The same scope as createUser and sendSignInLink, the two halves this
  // function runs; the role grant is checked inside, only when asked for.
  scopes: ['admin:users:create'],
  input: InviteUserInput,
  output: InviteUserOutput,
  func: async ({ auth, scopeService }, { email, name, role }, { session }) => {
    const address = email.trim().toLowerCase()
    if (!EMAIL_SHAPE.test(address)) {
      throw new BadRequestError('INVALID_EMAIL: that is not an email address')
    }

    // Everything that can refuse the role runs before anything is written, so
    // a refused invite leaves no account behind.
    if (role !== undefined) {
      verifyScopes(['admin:scopes:manage'], session)
      if (!scopeService) {
        throw new MissingServiceError(
          'Granting a role on invite requires a scope service'
        )
      }
      const roles = await scopeService.listRoles()
      if (
        !roles.some(
          (candidate) => candidate.name === role && candidate.declared !== false
        )
      ) {
        throw new InviteUnknownRoleError(role)
      }
    }

    if (!auth) {
      throw new MissingServiceError(
        'Inviting a user requires better-auth to be wired (services.auth is missing)'
      )
    }
    const ctx = await (await auth()).$context
    const existing = (await ctx.internalAdapter.findUserByEmail(address))
      ?.user as
      | { id: string; banned?: boolean | null; banExpires?: Date | null }
      | undefined
    if (existing && isBanned(existing)) {
      throw new InviteUserBannedError()
    }

    // The row has to exist before the link goes out: with
    // magicLink({ disableSignUp: true }) a link only admits an existing user.
    const userId =
      existing?.id ?? (await createAuthUser(auth, { email: address, name }))

    try {
      await sendAuthUserSignInLink(auth, { email: address })
    } catch (error) {
      throw new InviteMailFailedError(error)
    }

    if (role !== undefined && scopeService) {
      const held = await scopeService.listUserRoles(userId)
      if (!held.includes(role)) {
        await scopeService.addUserToRole(userId, role, session?.userId)
      }
    }

    return { userId, created: !existing }
  },
})
