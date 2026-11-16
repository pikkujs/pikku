import { addError, PikkuError } from '@pikku/core/errors'

/*
 * The refusals of `inviteUser`. Each message starts with a fixed code so a
 * client can tell them apart by the words alone, and each answers a status
 * below 500, because the HTTP error handler sends the thrown message only for
 * those: at 500 a production caller gets the registered message instead.
 *
 * None of them answers 403, 404, 409 or a 502-504: a client reads those as
 * "not allowed", "no such function" and "the app is not running".
 */

/** The address belongs to a user whose ban has not lapsed. */
export class InviteUserBannedError extends PikkuError {
  constructor() {
    super('USER_BANNED: that user is banned and cannot be invited')
  }
}
addError(InviteUserBannedError, {
  status: 422,
  message: 'USER_BANNED: that user is banned and cannot be invited',
})

/** The role to grant is not one the scope service offers for new grants. */
export class InviteUnknownRoleError extends PikkuError {
  constructor(role: string) {
    super(`UNKNOWN_ROLE: there is no role named ${JSON.stringify(role)}`)
  }
}
addError(InviteUnknownRoleError, {
  status: 400,
  message: 'UNKNOWN_ROLE: there is no role by that name',
})

/**
 * The sign-in link did not go out. The mailer's own words stay on `cause` and
 * are not sent, except better-auth's "requires the magicLink() plugin"
 * configuration error, which is kept in the message so a client can say the
 * app has no magic link configured rather than that a mail failed.
 */
export class InviteMailFailedError extends PikkuError {
  readonly cause: unknown

  constructor(cause: unknown) {
    const reason = cause instanceof Error ? cause.message : ''
    super(
      /magicLink\(\) plugin/.test(reason)
        ? `MAIL_FAILED: ${reason}`
        : 'MAIL_FAILED: the sign-in link could not be sent'
    )
    this.cause = cause
  }
}
addError(InviteMailFailedError, {
  status: 422,
  message: 'MAIL_FAILED: the sign-in link could not be sent',
})
