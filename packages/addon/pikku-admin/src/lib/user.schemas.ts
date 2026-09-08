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
})

export const ListUsersInput = z.object({
  search: z.string().optional(),
  limit: z.number().int().positive().optional(),
})

export const ListUsersOutput = z.object({
  users: z.array(User),
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
