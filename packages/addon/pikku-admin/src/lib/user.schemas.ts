import { z } from 'zod'

/**
 * A user, as the directory sees one. Ban state is optional because those
 * columns belong to the `ban()` plugin: a host without it reports no ban state
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
