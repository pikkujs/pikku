import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { NotFoundError } from '#pikku/error'
import { BUCKET } from '../../lib/file-keys.js'
import { isOrderOwner } from '../../wirings/shop.security.js'

export const GetDamagePhotoUrlInput = z.object({ orderId: z.string() })
export const GetDamagePhotoUrlOutput = z.object({ url: z.string() })

// @snippet start contentDownloadUrl
// Whoever gets this URL can read the file until it expires, so the permission
// on this function is what decides who may read it.
export const getDamagePhotoUrl = pikkuFunc({
  expose: true,
  readonly: true,
  description: 'A short-lived URL for the damage photo on an order.',
  input: GetDamagePhotoUrlInput,
  output: GetDamagePhotoUrlOutput,
  permissions: { owner: isOrderOwner },
  func: async ({ kysely, content }, { orderId }) => {
    const order = await kysely
      .selectFrom('order')
      .select('damagePhotoKey')
      .where('orderId', '=', orderId)
      .executeTakeFirst()
    if (!order?.damagePhotoKey) throw new NotFoundError()

    const url = await content.getDownloadURL({
      bucket: BUCKET,
      key: order.damagePhotoKey,
      expiresInSeconds: 300,
    })
    return { url }
  },
})
// @snippet end contentDownloadUrl
