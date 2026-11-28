/**
 * Type-level coverage for `defineCollections`. Compiled by
 * tsconfig.type-tests.json.
 */
import { defineTables } from '../db/index.js'
import { defineCollections, type CollectionHandlers } from './index.js'

const tables = defineTables({
  offering: {
    columns: {
      id: { type: 'key', primaryKey: true },
      title: { type: 'text', required: true },
      body: { type: 'text' },
      cover: { type: 'string(300)' },
      priceMinor: { type: 'integer' },
      currency: { type: 'string(3)' },
      therapistId: { type: 'text', references: 'therapist.id' },
      startsAt: { type: 'timestamp' },
      passwordHash: { type: 'text', security: 'secret', form: 'hashed' },
      meta: { type: 'json' },
      createdBy: { type: 'text', input: false },
    },
  },
  therapist: {
    columns: {
      id: { type: 'key', primaryKey: true },
      name: { type: 'text' },
    },
  },
})

const list = { columns: ['title'] } as const

export const accepted = defineCollections<typeof tables>()({
  offering: {
    label: 'Offerings',
    title: 'title',
    thumbnail: 'cover',
    list: {
      columns: ['title', 'priceMinor', 'startsAt'],
      filter: ['startsAt'],
      sort: ['title'],
      search: ['title'],
    },
    detail: ['id', 'createdBy'],
    edit: {
      title: true,
      body: 'richtext',
      cover: {
        input: 'image',
        bucket: 'site',
        accept: ['image/png'],
        maxBytes: 1000,
      },
      priceMinor: { input: 'money', currency: 'currency' },
      currency: true,
      therapistId: 'relation',
      startsAt: { label: 'Starts' },
    },
    groups: [{ label: 'Main', fields: ['title', 'body'] }],
    create: true,
    permissions: { read: 'src/checks.ts#mayRead' },
  },
  therapist: {
    label: 'Therapists',
    title: 'name',
    list: { columns: ['name'] },
  },
  blogPost: { from: 'blog', delete: false, actions: { publish: false } },
})

const define = defineCollections<typeof tables>()

define({
  // @ts-expect-error not a column of the table
  offering: { label: 'O', title: 'titel', list },
})

define({
  // @ts-expect-error a secret column may not be named
  offering: { label: 'O', title: 'title', list, detail: ['passwordHash'] },
})

define({
  // @ts-expect-error a json column may not be named
  offering: { label: 'O', title: 'title', list: { columns: ['meta'] } },
})

define({
  // @ts-expect-error the primary key is never edited
  offering: { label: 'O', title: 'title', list, edit: { id: true } },
})

define({
  // @ts-expect-error an input:false column is never edited
  offering: { label: 'O', title: 'title', list, edit: { createdBy: true } },
})

define({
  offering: {
    label: 'O',
    title: 'title',
    list,
    // @ts-expect-error richtext needs a text column
    edit: { startsAt: 'richtext' },
  },
})

define({
  offering: {
    label: 'O',
    title: 'title',
    list,
    // @ts-expect-error money needs an integer column
    edit: { title: { input: 'money', currency: 'EUR' } },
  },
})

define({
  // @ts-expect-error a relation needs a column with references
  offering: { label: 'O', title: 'title', list, edit: { body: 'relation' } },
})

define({
  // @ts-expect-error an unknown setting is not ignored
  offering: { label: 'O', title: 'title', list, delte: true },
})

define({
  // @ts-expect-error create is off or on, never a name
  offering: { label: 'O', title: 'title', list, create: 'yes' },
})

define({
  // @ts-expect-error a key that names no table needs `from`
  offerings: { label: 'O', title: 'title', list },
})

define({
  // @ts-expect-error an app cannot switch an addon operation on
  blogPost: { from: 'blog', create: true },
})

define({
  // @ts-expect-error an app check is '<module>#<export>'
  offering: { label: 'O', title: 'title', list, permissions: { read: 'x' } },
})

export const untyped = defineCollections()({
  anything: { label: 'A', title: 'a', list: { columns: ['a'] } },
  other: { from: 'blog' },
})

type Services = { db: { read: () => Promise<{ id: string; title: string }[]> } }

export const handlers: CollectionHandlers<Services> = {
  list: async ({ db }, query) => ({
    rows: (await db.read()).slice(0, query.limit),
    hasMore: false,
  }),
  get: async ({ db }) => ({ row: (await db.read())[0]! }),
}

// @ts-expect-error every collection needs get
export const withoutGet: CollectionHandlers<Services> = {
  list: async () => ({ rows: [], hasMore: false }),
}
