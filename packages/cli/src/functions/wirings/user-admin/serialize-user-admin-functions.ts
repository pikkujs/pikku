/**
 * Generate the user-management functions that wrap better-auth's `admin()`
 * endpoints into the project scaffold.
 *
 * Scaffolded rather than shipped in an addon because banning a user is ordinary
 * application behaviour: an app should not have to install the console — which
 * exists to be served alongside a running dev server — just to get it. The
 * console UI calls these same functions when it is present.
 *
 * Each function is gated on its own `admin:users:*` scope. The scopes are only
 * meaningful where `admin()` is wired, which is why this file is generated only
 * in that case.
 */
export const serializeUserAdminFunctions = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true
) => {
  const authFlag = requireAuth ? 'true' : 'false'
  return `/**
 * Auto-generated user management functions
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuFunc, wireScope } from '${pathToPikkuTypes}'
import { callAdminApi } from '@pikku/better-auth'

// pikku requires every declaration of a shared scope root to be identical, so
// this is the whole \`admin\` tree — not just the leaves gated below. It must stay
// byte-identical to ADMIN_SCOPE_TREE in @pikku/better-auth and to the copy in
// @pikku/addon-console, or codegen fails with conflicting declarations.
wireScope({
  admin: {
    displayName: 'Administration',
    description: 'Capabilities that act on the application as a whole',
    scopes: {
      impersonate: { description: 'Act as another user' },
      credentials: {
        description: 'Application-wide credentials',
        scopes: {
          link: { description: 'Bind a shared credential for every user' },
        },
      },
      users: {
        description: 'The user directory',
        scopes: {
          list: { description: 'List and search users' },
          ban: { description: 'Ban and unban users' },
          remove: { description: 'Delete users and all their data' },
          sessions: { description: "Revoke a user's sessions" },
          password: { description: "Set a user's password" },
        },
      },
    },
  },
})

export const pikkuAdminSetUserBanned = pikkuFunc<
  {
    userId: string
    banned: boolean
    reason?: string
    expiresInSeconds?: number
  },
  { success: boolean }
>({
  tags: ['pikku'],
  title: 'Ban or Unban User',
  description:
    "Bans a user — revoking their sessions and blocking sign-in — or lifts an existing ban. An expiry lets the ban lapse on its own; without one it holds until it is lifted.",
  expose: true,
  auth: ${authFlag},
  scopes: ['admin:users:ban'],
  func: async ({ auth }, { userId, banned, reason, expiresInSeconds }, { http }) => {
    await callAdminApi(auth, http, (api, headers) =>
      banned
        ? api.banUser!({
            body: { userId, banReason: reason, banExpiresIn: expiresInSeconds },
            headers,
          })
        : api.unbanUser!({ body: { userId }, headers })
    )
    return { success: true }
  },
})

export const pikkuAdminRemoveUser = pikkuFunc<
  { userId: string },
  { success: boolean }
>({
  tags: ['pikku'],
  title: 'Remove User',
  description:
    'Permanently deletes a user along with their sessions and linked accounts. Cannot be undone.',
  expose: true,
  auth: ${authFlag},
  scopes: ['admin:users:remove'],
  func: async ({ auth }, { userId }, { http }) => {
    await callAdminApi(auth, http, (api, headers) =>
      api.removeUser!({ body: { userId }, headers })
    )
    return { success: true }
  },
})

export const pikkuAdminRevokeUserSessions = pikkuFunc<
  { userId: string },
  { success: boolean }
>({
  tags: ['pikku'],
  title: 'Revoke User Sessions',
  description:
    'Signs a user out of every device by deleting all of their sessions. They keep their account and can sign in again.',
  expose: true,
  auth: ${authFlag},
  scopes: ['admin:users:sessions'],
  func: async ({ auth }, { userId }, { http }) => {
    await callAdminApi(auth, http, (api, headers) =>
      api.revokeUserSessions!({ body: { userId }, headers })
    )
    return { success: true }
  },
})

export const pikkuAdminSetUserPassword = pikkuFunc<
  { userId: string; newPassword: string },
  { success: boolean }
>({
  tags: ['pikku'],
  title: "Set User's Password",
  description:
    'Sets a user password out of band, for when they cannot complete a reset themselves. better-auth enforces the configured length bounds.',
  expose: true,
  auth: ${authFlag},
  scopes: ['admin:users:password'],
  func: async ({ auth }, { userId, newPassword }, { http }) => {
    await callAdminApi(auth, http, (api, headers) =>
      api.setUserPassword!({ body: { userId, newPassword }, headers })
    )
    return { success: true }
  },
})
`
}
