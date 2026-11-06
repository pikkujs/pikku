import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { BadRequestError } from '#pikku/error'
import { BUCKET } from '../../lib/file-keys.js'
import { isOrderOwner } from '../../wirings/shop.security.js'
import { DamagePhotoType } from './request-damage-photo-upload.function.js'

export const SaveDamagePhotoInput = z.object({
  orderId: z.string(),
  fileKey: z.string().min(1),
  contentType: DamagePhotoType,
})

// @snippet start contentSaveKey
export const saveDamagePhoto = pikkuFunc({
  expose: true,
  description: 'Record the uploaded damage photo against the order.',
  input: SaveDamagePhotoInput,
  permissions: { owner: isOrderOwner },
  func: async ({ kysely, content }, { orderId, fileKey, contentType }) => {
    // The key came back from the client, so check it before trusting it: saving
    // another order's key would make the read URL below hand that file out.
    const stored = fileKey.startsWith(`${orderId}/`)
      ? await content.listFilesByPrefix(BUCKET, fileKey)
      : []
    if (!stored.includes(fileKey)) {
      throw new BadRequestError('No such upload for this order')
    }

    await kysely
      .updateTable('order')
      .set({
        damagePhotoKey: fileKey,
        damagePhotoType: contentType,
        updatedAt: new Date().toISOString(),
      })
      .where('orderId', '=', orderId)
      .execute()
  },
})
// @snippet end contentSaveKey
