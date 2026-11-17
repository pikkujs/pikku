import { hasScopes } from '#pikku/scopes/pikku-scope-client.gen.js'

export const showRefundButton = (scopes: readonly string[]) =>
  // @snippet start hasScopes
  hasScopes(['orders:refund'], scopes)
// @snippet end hasScopes
