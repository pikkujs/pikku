import { z } from 'zod'

/**
 * A user, as the directory sees one. Ban state is optional because those
 * columns belong to the `pikkuBan()` plugin: a host without it reports no ban state
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
  /**
   * Present only when `includeRoles` was asked for, and only on a host with a
   * scope service — an empty array then means the user holds no roles.
   */
  roles: z.array(z.string()).optional(),
  /**
   * The host's own `user.additionalFields`, by the names it declared them
   * under. An addon cannot know an application's columns, so it reports
   * whatever better-auth was configured with rather than a fixed shape — which
   * is what lets a directory screen render a display name or an avatar without
   * a second call into the application's own code.
   */
  fields: z.record(z.string(), z.unknown()).optional(),
})

export const ListUsersInput = z.object({
  search: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  /**
   * Roles cost a second query and are gated on `admin:scopes:read`, which
   * `admin:users:list` does not imply — so they are asked for rather than
   * always sent, and a caller without that scope is refused instead of
   * quietly handed a directory with no roles in it.
   */
  includeRoles: z.boolean().optional(),
})

export const ListUsersOutput = z.object({
  users: z.array(User),
  /**
   * How many users match `search`, which is not `users.length` once `limit`
   * and `offset` have done their work — it is what a pager counts against.
   */
  total: z.number(),
})

/**
 * A password is optional: an account created without one has no credential
 * row, so it cannot be signed into until `setUserPassword` gives it one — the
 * provisioning half of an invite, for an app that mails its own link or signs
 * users in through a social provider.
 */
export const CreateUserInput = z.object({
  email: z.string(),
  password: z.string().optional(),
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

/**
 * An invite is addressed by email rather than by id: the link is mailed to an
 * address, and the plugin resolves the user from it. `callbackURL` is where the
 * app wants the accepted invite to land.
 */
export const SendSignInLinkInput = z.object({
  email: z.string(),
  callbackURL: z.string().optional(),
})

export const Success = z.object({
  success: z.boolean(),
})
