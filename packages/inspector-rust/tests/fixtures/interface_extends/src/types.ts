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
