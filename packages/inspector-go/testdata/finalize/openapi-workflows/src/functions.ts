import { pikkuFunc, pikkuSessionlessFunc } from './pikku.js'
import type { CreateItemInput, Item, ItemList, SearchResult } from './types.js'

export const getItem = pikkuSessionlessFunc<{ id: string }, Item>({
  description: 'Fetch an item',
  func: async (_s, { id }) => ({ id }) as unknown as Item,
})

export const listItems = pikkuSessionlessFunc<
  { page?: number; q?: string },
  ItemList
>({
  func: async () => ({ items: [], total: 0, page: 0 }),
})

export const searchItems = pikkuSessionlessFunc<{ q: string }, SearchResult>({
  func: async () => ({ kind: 'none', reason: 'empty' }),
})

export const createItem = pikkuFunc<CreateItemInput, Item>({
  version: 2,
  func: async () => ({}) as Item,
})

export const createItemV1 = pikkuFunc<CreateItemInput, Item>({
  version: 1,
  func: async () => ({}) as Item,
})

export const ping = pikkuSessionlessFunc<void, string>({
  func: async () => 'pong',
})

export const countItems = pikkuSessionlessFunc<{}, number>({
  func: async () => 1,
})

export const deleteItem = pikkuFunc<{ id: string; orgId: string }, boolean>({
  version: 4,
  func: async () => true,
})

export const archiveItem = pikkuFunc<{ id: string }, void>({
  func: async () => {},
})

export const notifyOwner = pikkuSessionlessFunc<
  { itemId: string; message: string },
  { sent: boolean }
>({
  func: async () => ({ sent: true }),
})

export const priceCheck = pikkuSessionlessFunc<
  { itemId: string },
  { ok: boolean; price: number }
>({
  func: async () => ({ ok: true, price: 1 }),
})
