export interface UserAdminGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate the user-management functions into the project scaffold: the
 * directory read plus the writes that administer it.
 *
 * Superseded by `@pikku/addon-admin`, which ships these same functions plus
 * roles, credentials and the audit trail, and which an app can wire without
 * installing the console. Kept for hosts still on the scaffold; the scope tree
 * below must stay byte-identical to the addon's, or an app with both fails
 * codegen on conflicting declarations.
 *
 * Each function is gated on its own `admin:users:*` scope, and works through
 * better-auth's internal adapter. Banning additionally needs the `ban()` plugin
 * from `@pikku/better-auth` for the columns it writes to exist.
 *
 * Emitted as two files. The schemas are zod, and the inspector reads a zod
 * schema by importing the module that declares it — which it cannot do for the
 * functions file, whose relative pikku-types import per-unit deploy codegen
 * rewrites. Keeping the schemas in a sibling module that imports nothing but
 * zod sidesteps that entirely.
 */
export const serializeUserAdminFunctions = (
  leaf: (name: string) => string
): UserAdminGenOutput => {
  const schemas = `/**
 * Auto-generated user management schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

/**
 * A user, as the directory sees one. Ban state is optional because those
 * columns belong to the \`ban()\` plugin: a host without it reports no ban state
 * at all, which a client can render as "unknown" rather than as a misleading
 * "not banned".
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
import { pikkuFunc } from '${leaf('function')}'
import { defineScope } from '${leaf('scopes')}'
import {
  createAuthUser,
  deleteAuthUser,
  revokeAuthUserSessions,
  setAuthUserBanned,
  setAuthUserPassword,
} from '@pikku/better-auth'
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
// @pikku/addon-admin, or codegen fails with conflicting declarations.
defineScope({
  admin: {
    displayName: 'Administration',
    description: 'Capabilities that act on the application as a whole',
    scopes: {
      impersonate: { description: 'Act as another user' },
      credentials: {
        description: 'Application-wide credentials',
        scopes: {
          link: { description: 'Bind a shared credential for every user' },
          read: { description: 'Read credential values and who holds them' },
          manage: { description: 'Set and delete credentials' },
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
      scopes: {
        description: 'Authorization management',
        scopes: {
          read: {
            description: 'View declared scopes, roles, and who holds them',
          },
          manage: {
            description:
              'Create and delete roles, change their scopes, and grant roles to users',
          },
        },
      },
      audit: {
        description: 'The audit trail',
        scopes: {
          read: {
            description:
              'Read the audit trail — every recorded action, and which user took it',
          },
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
    'Lists and searches the user directory, read through the auth adapter so it works on any database better-auth supports.',
  expose: true,
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
    'Creates a user directly, for provisioning an account out of band rather than through your sign-up flow. Enforces the configured password bounds and rejects a duplicate email.',
  expose: true,
  scopes: ['admin:users:create'],
  input: CreateUserInput,
  output: CreateUserOutput,
  func: async ({ auth }, { email, password, name }) => ({
    userId: await createAuthUser(auth, { email, password, name }),
  }),
})

export const pikkuAdminSetUserBanned = pikkuFunc({
  tags: ['pikku'],
  title: 'Ban or Unban User',
  description:
    'Bans a user — revoking their sessions and blocking sign-in — or lifts an existing ban. An expiry lets the ban lapse on its own; without one it holds until it is lifted. Requires better-auth wired with the \`ban()\` plugin.',
  expose: true,
  scopes: ['admin:users:ban'],
  input: SetUserBannedInput,
  output: Success,
  func: async (
    { auth },
    { userId, banned, reason, expiresInSeconds },
    { session }
  ) => {
    if (banned && userId === session?.userId) {
      throw new Error('You cannot ban yourself')
    }
    await setAuthUserBanned(auth, { userId, banned, reason, expiresInSeconds })
    return { success: true }
  },
})

export const pikkuAdminRemoveUser = pikkuFunc({
  tags: ['pikku'],
  title: 'Remove User',
  description:
    'Permanently deletes a user along with their sessions and linked accounts. Cannot be undone.',
  expose: true,
  scopes: ['admin:users:remove'],
  input: UserRef,
  output: Success,
  func: async ({ auth }, { userId }, { session }) => {
    if (userId === session?.userId) {
      throw new Error('You cannot delete yourself')
    }
    await deleteAuthUser(auth, userId)
    return { success: true }
  },
})

export const pikkuAdminRevokeUserSessions = pikkuFunc({
  tags: ['pikku'],
  title: 'Revoke User Sessions',
  description:
    'Signs a user out of every device by deleting all of their sessions. They keep their account and can sign in again.',
  expose: true,
  scopes: ['admin:users:sessions'],
  input: UserRef,
  output: Success,
  func: async ({ auth }, { userId }) => {
    await revokeAuthUserSessions(auth, userId)
    return { success: true }
  },
})

export const pikkuAdminSetUserPassword = pikkuFunc({
  tags: ['pikku'],
  title: "Set User's Password",
  description:
    'Sets a user password out of band, for when they cannot complete a reset themselves. Enforces the configured length bounds, and gives a user who only ever signed in socially a credential account.',
  expose: true,
  scopes: ['admin:users:password'],
  input: SetUserPasswordInput,
  output: Success,
  func: async ({ auth }, { userId, newPassword }) => {
    await setAuthUserPassword(auth, { userId, newPassword })
    return { success: true }
  },
})
`

  return { schemas, functions }
}
