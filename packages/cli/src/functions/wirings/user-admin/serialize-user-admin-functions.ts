export interface UserAdminGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate the user-management functions into the project scaffold: the
 * directory read plus the writes that wrap better-auth's `admin()` endpoints.
 *
 * Scaffolded rather than shipped in an addon because managing users is ordinary
 * application behaviour: an app should not have to install the console — which
 * exists to be served alongside a running dev server — just to list or ban its
 * own users. The console UI calls these same functions when it is present.
 *
 * Each function is gated on its own `admin:users:*` scope. The writes are only
 * meaningful where `admin()` is wired, which is why this file is generated only
 * in that case.
 *
 * Emitted as two files. The schemas are zod, and the inspector reads a zod
 * schema by importing the module that declares it — which it cannot do for the
 * functions file, whose relative pikku-types import per-unit deploy codegen
 * rewrites. Keeping the schemas in a sibling module that imports nothing but
 * zod sidesteps that entirely.
 */
export const serializeUserAdminFunctions = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true
): UserAdminGenOutput => {
  const authFlag = requireAuth ? 'true' : 'false'

  const schemas = `/**
 * Auto-generated user management schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

/**
 * A user, as the directory sees one. Ban state is optional because those
 * columns belong to better-auth's \`admin()\` plugin: a host without it reports
 * no ban state at all, which a client can render as "unknown" rather than as a
 * misleading "not banned".
 */
export const User = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().optional(),
  image: z.string().optional(),
  createdAt: z.string().optional(),
  banned: z.boolean().optional(),
  banReason: z.string().optional(),
  banExpires: z.string().optional(),
})

export const ListUsersInput = z.object({
  search: z.string().optional(),
  limit: z.number().int().positive().optional(),
})

export const ListUsersOutput = z.object({
  users: z.array(User),
})

export const CreateUserInput = z.object({
  email: z.string(),
  password: z.string(),
  name: z.string().optional(),
})

export const CreateUserOutput = z.object({
  userId: z.string(),
})

/** Every write targets one user by id. */
export const UserRef = z.object({
  userId: z.string(),
})

export const SetUserBannedInput = z.object({
  userId: z.string(),
  banned: z.boolean(),
  reason: z.string().optional(),
  expiresInSeconds: z.number().int().positive().optional(),
})

export const SetUserPasswordInput = z.object({
  userId: z.string(),
  newPassword: z.string(),
})

export const Success = z.object({
  success: z.boolean(),
})
`

  const functions = `/**
 * Auto-generated user management functions
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuFunc, wireScope } from '${pathToPikkuTypes}'
import { callAdminApi } from '@pikku/better-auth'
import {
  CreateUserInput,
  CreateUserOutput,
  ListUsersInput,
  ListUsersOutput,
  SetUserBannedInput,
  SetUserPasswordInput,
  Success,
  UserRef,
} from './user-admin.schemas.gen.js'

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
          create: { description: 'Create users out of band' },
          ban: { description: 'Ban and unban users' },
          remove: { description: 'Delete users and all their data' },
          sessions: { description: "Revoke a user's sessions" },
          password: { description: "Set a user's password" },
        },
      },
    },
  },
})

/**
 * Synthetic principals — the platform credential owner, fabric service users
 * and agent actors — are not people, so they never belong in a directory a
 * human picks from.
 */
const isPerson = (row: any) =>
  row.fabric !== true && row.actor !== true && row.id !== 'pikku-platform'

export const pikkuAdminListUsers = pikkuFunc({
  tags: ['pikku'],
  title: 'List Users',
  description:
    'Lists and searches the user directory, read through the auth adapter rather than an admin endpoint so it works on any database better-auth supports.',
  expose: true,
  auth: ${authFlag},
  scopes: ['admin:users:list'],
  input: ListUsersInput,
  output: ListUsersOutput,
  func: async ({ auth }, { search, limit }) => {
    const ctx = await (await auth()).$context
    const rows = (await ctx.adapter.findMany({
      model: 'user',
      limit: limit ?? 200,
      where: search
        ? [{ field: 'email', operator: 'contains', value: search }]
        : undefined,
    })) as any[]

    return {
      users: rows.filter(isPerson).map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name ?? undefined,
        image: row.image ?? undefined,
        createdAt: row.createdAt
          ? new Date(row.createdAt).toISOString()
          : undefined,
        banned: typeof row.banned === 'boolean' ? row.banned : undefined,
        banReason: row.banReason ?? undefined,
        banExpires: row.banExpires
          ? new Date(row.banExpires).toISOString()
          : undefined,
      })),
    }
  },
})

export const pikkuAdminCreateUser = pikkuFunc({
  tags: ['pikku'],
  title: 'Create User',
  description:
    'Creates a user directly, for provisioning an account out of band rather than through your sign-up flow. better-auth enforces the configured password bounds and rejects a duplicate email.',
  expose: true,
  auth: ${authFlag},
  scopes: ['admin:users:create'],
  input: CreateUserInput,
  output: CreateUserOutput,
  func: async ({ auth }, { email, password, name }, { http }) => {
    const created: any = await callAdminApi(auth, http, (api, headers) =>
      api.createUser!({
        body: { email, password, name: name ?? email },
        headers,
      })
    )
    return { userId: created?.user?.id ?? created?.id }
  },
})

export const pikkuAdminSetUserBanned = pikkuFunc({
  tags: ['pikku'],
  title: 'Ban or Unban User',
  description:
    'Bans a user — revoking their sessions and blocking sign-in — or lifts an existing ban. An expiry lets the ban lapse on its own; without one it holds until it is lifted.',
  expose: true,
  auth: ${authFlag},
  scopes: ['admin:users:ban'],
  input: SetUserBannedInput,
  output: Success,
  func: async (
    { auth },
    { userId, banned, reason, expiresInSeconds },
    { http }
  ) => {
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

export const pikkuAdminRemoveUser = pikkuFunc({
  tags: ['pikku'],
  title: 'Remove User',
  description:
    'Permanently deletes a user along with their sessions and linked accounts. Cannot be undone.',
  expose: true,
  auth: ${authFlag},
  scopes: ['admin:users:remove'],
  input: UserRef,
  output: Success,
  func: async ({ auth }, { userId }, { http }) => {
    await callAdminApi(auth, http, (api, headers) =>
      api.removeUser!({ body: { userId }, headers })
    )
    return { success: true }
  },
})

export const pikkuAdminRevokeUserSessions = pikkuFunc({
  tags: ['pikku'],
  title: 'Revoke User Sessions',
  description:
    'Signs a user out of every device by deleting all of their sessions. They keep their account and can sign in again.',
  expose: true,
  auth: ${authFlag},
  scopes: ['admin:users:sessions'],
  input: UserRef,
  output: Success,
  func: async ({ auth }, { userId }, { http }) => {
    await callAdminApi(auth, http, (api, headers) =>
      api.revokeUserSessions!({ body: { userId }, headers })
    )
    return { success: true }
  },
})

export const pikkuAdminSetUserPassword = pikkuFunc({
  tags: ['pikku'],
  title: "Set User's Password",
  description:
    'Sets a user password out of band, for when they cannot complete a reset themselves. better-auth enforces the configured length bounds.',
  expose: true,
  auth: ${authFlag},
  scopes: ['admin:users:password'],
  input: SetUserPasswordInput,
  output: Success,
  func: async ({ auth }, { userId, newPassword }, { http }) => {
    await callAdminApi(auth, http, (api, headers) =>
      api.setUserPassword!({ body: { userId, newPassword }, headers })
    )
    return { success: true }
  },
})
`

  return { schemas, functions }
}
