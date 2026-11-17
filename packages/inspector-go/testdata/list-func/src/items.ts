import { pikkuListFunc } from './list-helper.js'

export const listItems = pikkuListFunc<
  { category?: string; inStock: boolean },
  { id: string; label: string },
  'label' | 'createdAt'
>({
  func: async () => ({ rows: [], nextCursor: null }),
})

export const listTags = pikkuListFunc<{ name: string }, { id: string }>({
  func: async () => ({ rows: [], nextCursor: null }),
})

export type NamedFilter = { owner: string }

export const listNamed = pikkuListFunc<NamedFilter, { id: string }, 'id'>({
  func: async () => ({ rows: [], nextCursor: null }),
})
