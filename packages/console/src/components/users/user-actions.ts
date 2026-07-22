/**
 * The user-management actions that need confirming before they run. Lifting a
 * ban is absent on purpose: it is the only one of the five that takes nothing
 * away, so the menu performs it directly.
 */
export type UserAction = 'ban' | 'revoke' | 'password' | 'remove'

/**
 * The scope each action is gated on, mirroring the `scopes` field of the
 * scaffolded function it calls. The console hides what the caller cannot do;
 * the server is what actually refuses it.
 */
export const USER_ACTION_SCOPE: Record<UserAction | 'unban', string> = {
  ban: 'admin:users:ban',
  unban: 'admin:users:ban',
  revoke: 'admin:users:sessions',
  password: 'admin:users:password',
  remove: 'admin:users:remove',
}
