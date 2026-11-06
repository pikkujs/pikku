import { pikkuAuth, pikkuPermissionFactory } from '#pikku/auth'

export const canSendEmail = pikkuAuth({
  skipWithoutSession: true,
  func: async ({ email }) => {
    // Check email quota or something
    return true
  },
})

export const canProcessPayment = pikkuAuth({
  skipWithoutSession: true,
  func: async ({ payment }) => {
    // Check payment limits
    return true
  },
})

export const hasEmailQuota = pikkuPermissionFactory((quota: number) =>
  pikkuAuth({
    skipWithoutSession: true,
    func: async ({ email }) => {
      // Check email quota
      return true
    },
  })
)
