import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { BUCKET, buildFileKey } from '../../lib/file-keys.js'

export const RequestItemPhotoUploadInput = z.object({
  itemId: z.string(),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
})

export const RequestItemPhotoUploadOutput = z.object({
  // The browser PUTs the raw bytes here. They never pass through this server,
  // which is the whole reason for presigning: a 20 MB photo would otherwise
  // occupy a request slot for as long as the shopper's upstream takes.
  uploadUrl: z.string(),
  uploadMethod: z.enum(['PUT', 'POST']).optional(),
  uploadHeaders: z.record(z.string(), z.string()).optional(),
  photoKey: z.string(),
})

/**
 * Presign an upload, and record the key against the item.
 *
 * The key is written before the bytes arrive. That is deliberate: an upload
 * that is abandoned leaves a row pointing at nothing, which reads as a missing
 * photo, whereas recording the key afterwards needs a second round trip the
 * client can simply never make — and then the bytes exist with nothing
 * pointing at them, which nobody ever notices.
 */
export const requestItemPhotoUpload = pikkuFunc({
  expose: true,
  description: 'Presign a URL to upload a photo for an item.',
  input: RequestItemPhotoUploadInput,
  output: RequestItemPhotoUploadOutput,
  scopes: ['catalogue:write'],
  func: async ({ kysely, content }, { itemId, fileName, contentType }) => {
    // Item photos are public: they are the shop front. The private branch of
    // `buildFileKey` is what an invoice or an ID document would use.
    const photoKey = buildFileKey('public', itemId, fileName)

    const { uploadUrl, uploadMethod, uploadHeaders } =
      await content.getUploadURL({
        bucket: BUCKET,
        fileKey: photoKey,
        contentType,
        visibility: 'public',
      })

    await kysely
      .updateTable('item')
      .set({ photoKey, updatedAt: new Date().toISOString() })
      .where('itemId', '=', itemId)
      .execute()

    return { uploadUrl, uploadMethod, uploadHeaders, photoKey }
  },
})
