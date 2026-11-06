import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { BUCKET, buildFileKey } from '../../lib/file-keys.js'
import { isOrderOwner } from '../../wirings/shop.security.js'

export const DamagePhotoType = z.enum(['image/jpeg', 'image/png', 'image/webp'])

export const RequestDamagePhotoUploadInput = z.object({
  orderId: z.string(),
  fileName: z.string().min(1),
  // `getUploadURL` does not check the type, so this is the allowlist.
  contentType: DamagePhotoType,
})

export const RequestDamagePhotoUploadOutput = z.object({
  uploadUrl: z.string(),
  uploadMethod: z.enum(['PUT', 'POST']).optional(),
  uploadHeaders: z.record(z.string(), z.string()).optional(),
  fileKey: z.string(),
})

// @snippet start contentUploadUrl
export const requestDamagePhotoUpload = pikkuFunc({
  expose: true,
  description: 'A URL the shopper can upload a photo of a damaged item to.',
  input: RequestDamagePhotoUploadInput,
  output: RequestDamagePhotoUploadOutput,
  permissions: { owner: isOrderOwner },
  func: async ({ content }, { orderId, fileName, contentType }) => {
    // The server builds the key, so a caller cannot choose where bytes land.
    const fileKey = buildFileKey('private', orderId, fileName)
    const { uploadUrl, uploadMethod, uploadHeaders } =
      await content.getUploadURL({ bucket: BUCKET, fileKey, contentType })
    return { uploadUrl, uploadMethod, uploadHeaders, fileKey }
  },
})
// @snippet end contentUploadUrl
