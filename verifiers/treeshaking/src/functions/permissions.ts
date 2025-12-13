import { pikkuPermission, pikkuPermissionFactory } from '#pikku'

export const canSendEmail = pikkuPermission(async ({ email }) => {
  // Check email quota or something
  return true
})

export const canProcessPayment = pikkuPermission(async ({ payment }) => {
  // Check payment limits
  return true
})

export const hasEmailQuota = pikkuPermissionFactory(
  (quota: number) =>
    async ({ email }) => {
      // Check email quota
      return true
    }
)
