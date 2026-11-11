import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { BUCKET } from '../../lib/file-keys.js'

export const GetItemPhotoUrlInput = z.object({ itemId: z.string() })

export const GetItemPhotoUrlOutput = z.object({
  url: z.string().nullable(),
  expiresAt: z.string().nullable(),
})

/**
 * A viewable URL for an item's photo.
 *
 * The photo was uploaded with `visibility: 'public'`, so it is read the same
 * way: public and private are two separate stores, and a read that leaves
 * `visibility` out looks in the private one. A public URL needs no signature
 * and does not expire.
 */
export const getItemPhotoUrl = pikkuSessionlessFunc({
  expose: true,
  readonly: true,
  description: 'A URL the browser can put straight in an img tag.',
  input: GetItemPhotoUrlInput,
  output: GetItemPhotoUrlOutput,
  func: async ({ kysely, content }, { itemId }) => {
    const item = await kysely
      .selectFrom('item')
      .select(['photoKey', 'imageUrl'])
      .where('itemId', '=', itemId)
      .executeTakeFirst()

    // A supplier's own CDN link needs no signing and never expires.
    if (item?.imageUrl && !item.photoKey) {
      return { url: item.imageUrl, expiresAt: null }
    }
    if (!item?.photoKey) return { url: null, expiresAt: null }

    const url = await content.getDownloadURL({
      bucket: BUCKET,
      key: item.photoKey,
      visibility: 'public',
    })

    return { url, expiresAt: null }
  },
})
