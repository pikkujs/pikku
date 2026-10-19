import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { BUCKET } from '../../lib/file-keys.js'

export const GetItemPhotoUrlInput = z.object({ itemId: z.string() })

export const GetItemPhotoUrlOutput = z.object({
  url: z.string().nullable(),
  expiresAt: z.string().nullable(),
})

/**
 * Mint a viewable URL for an item's photo.
 *
 * Signing even a public file looks redundant and is not: the local content
 * service requires a signature for every read, so signing is the one path that
 * works in development and in a deployed stage alike. The difference is the
 * window — a shop-front photo gets a far-future expiry, which is effectively a
 * stable link, while anything private would get minutes.
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

    const dateLessThan = new Date(Date.now() + 3650 * 24 * 3_600_000)
    const url = await content.signContentKey({
      bucket: BUCKET,
      contentKey: item.photoKey,
      dateLessThan,
    })

    return { url, expiresAt: dateLessThan.toISOString() }
  },
})
