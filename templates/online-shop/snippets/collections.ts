import { defineTables } from '@pikku/core/db'
import { defineCollections } from '@pikku/core/collections'

/*
 * Outside `db/`, so `pikku all` generates no collections functions for the shop: the
 * shop's tsconfig still compiles it.
 */
const tables = defineTables({
  article: {
    columns: {
      id: { type: 'key', primaryKey: true },
      title: { type: 'text', required: true },
      body: { type: 'text' },
      coverImage: { type: 'text' },
      updatedAt: { type: 'text', required: true },
    },
  },
})

// @snippet start collectionsDeclaration
export const collections = defineCollections<typeof tables>()({
  article: {
    label: 'Articles',
    title: 'title',
    thumbnail: 'coverImage',
    list: { columns: ['title', 'updatedAt'], search: ['title'] },
    edit: {
      title: true,
      body: 'richtext',
      coverImage: {
        input: 'image',
        bucket: 'shop',
        accept: ['image/png', 'image/jpeg', 'image/webp'],
        maxBytes: 5_000_000,
      },
    },
    create: true,
  },
})
// @snippet end collectionsDeclaration
