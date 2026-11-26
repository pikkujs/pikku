import { defineTables } from '@pikku/core/db'
import { defineCrud } from '@pikku/core/crud'

/*
 * Outside `db/`, so `pikku all` generates no CRUD functions for the shop: the
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

// @snippet start crudCollections
export const crud = defineCrud<typeof tables>()({
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
// @snippet end crudCollections
