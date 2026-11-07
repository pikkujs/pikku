export interface Base {
  a: string
}

export interface Out extends Base {
  b: number
}

export interface Items extends Array<string> {}

export interface Wrapper {
  out: Out
  items: Items
}

import { pikkuSessionlessFunc } from '@pikku/core'

export const readOut = pikkuSessionlessFunc<{ out: Out; items: Items }, { id: string }>({
  func: async () => ({ id: "x" }),
})

import type { Missing } from './empty.js'

export interface Orphan extends Missing {
  c: string
}

export const readOrphan = pikkuSessionlessFunc<{ orphan: Orphan }, { id: string }>({
  func: async () => ({ id: 'x' }),
})
