import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { isOrderOwner } from '../../wirings/shop.security.js'
import {
  fileKeyIsStored,
  fileKeyIsUnderOrder,
} from './damage-photo.permission.js'
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
  // One group, as an array, so all three must pass. Separate keys would be OR'd.
  permissions: { photo: [isOrderOwner, fileKeyIsUnderOrder, fileKeyIsStored] },
  func: async ({ kysely }, { orderId, fileKey, contentType }) => {
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
