import {
  pikkuPermission,
  pikkuPermissionFactory,
} from '../../.pikku/pikku-types.gen.js'

export const canSendEmail = pikkuPermission(
  async ({ email }, _data, _userSession) => {
    // Check email quota or something
    return true
  }
)

export const canProcessPayment = pikkuPermission(
  async ({ payment }, _data, _userSession) => {
    // Check payment limits
    return true
  }
)

export const hasEmailQuota = pikkuPermissionFactory(
  (quota: number) => async ({ email }, _data, _userSession) => {
    // Check email quota
    return true
  }
)
