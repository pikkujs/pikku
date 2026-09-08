/**
 * The user-management actions that need confirming before they run. Sending a
 * sign-in link takes nothing away, but it does put mail in a real person's
 * inbox, so it is confirmed like the rest. Lifting a ban is absent on purpose:
 * it is the one action that neither removes access nor reaches the user, so the
 * menu performs it directly.
 */
export type UserAction = 'ban' | 'revoke' | 'password' | 'remove' | 'signInLink'

/**
 * The scope each action is gated on, mirroring the `scopes` field of the
 * scaffolded function it calls. The console hides what the caller cannot do;
 * the server is what actually refuses it.
 */
export const USER_ACTION_SCOPE: Record<UserAction | 'unban', string> = {
  ban: 'admin:users:ban',
  unban: 'admin:users:ban',
  signInLink: 'admin:users:create',
  revoke: 'admin:users:sessions',
  password: 'admin:users:password',
  remove: 'admin:users:remove',
}
