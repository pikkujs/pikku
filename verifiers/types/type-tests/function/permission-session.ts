/**
 * Type constraint: a check always has a session and answers true or false,
 * with or without `skipWithoutSession`.
 */

import { pikkuAuth, pikkuPermission } from '#pikku/auth'

export const permissionHasSession = pikkuPermission(
  async (_services, _data, { session }) => Boolean(session.userId)
)

export const skippingPermissionHasSession = pikkuPermission({
  skipWithoutSession: true,
  func: async (_services, _data, { session }) => Boolean(session.userId),
})

export const authHasSession = pikkuAuth(async (_services, session) =>
  Boolean(session.userId)
)

export const skippingAuthHasSession = pikkuAuth({
  skipWithoutSession: true,
  func: async (_services, session) => Boolean(session.userId),
})

export const permissionMustAnswer = pikkuPermission(
  // @ts-expect-error a check returns true or false, never void
  async () => {}
)

export const skippingPermissionMustAnswer = pikkuPermission({
  skipWithoutSession: true,
  // @ts-expect-error skipping does not allow a void result
  func: async () => {},
})

export const skippingAuthMustAnswer = pikkuAuth({
  skipWithoutSession: true,
  // @ts-expect-error skipping does not allow a void result
  func: async () => {},
})
