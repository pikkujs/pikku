import { pikkuPermission } from '#pikku/auth'
import { BUCKET } from '../../lib/file-keys.js'

// @snippet start contentPermissions
// The key came back from the client, so it proves nothing until it is checked.
// Saving another order's key would make the read hand that file out.
export const fileKeyIsUnderOrder = pikkuPermission(
  async (_services, data: { orderId: string; fileKey: string }) =>
    data.fileKey.startsWith(`${data.orderId}/`)
)

export const fileKeyIsStored = pikkuPermission(
  async ({ content }, { fileKey }: { fileKey: string }) => {
    const stored = await content.listFilesByPrefix(BUCKET, fileKey)
    return stored.includes(fileKey)
  }
)
// @snippet end contentPermissions
