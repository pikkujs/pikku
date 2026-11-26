import { pikkuFunc } from './declare.js'

export const direct = pikkuFunc({
  scopes: ['admin:users'],
  func: async () => {},
})
export const inherited = pikkuFunc({
  scopes: ['admin:users:ban'],
  func: async () => {},
})
export const wildcard = pikkuFunc({
  scopes: ['admin:users:*'],
  func: async () => {},
})
export const rootLive = pikkuFunc({
  scopes: ['root:child'],
  func: async () => {},
})
export const declared = pikkuFunc({
  scopes: ['root:added'],
  func: async () => {},
})
export const quotedKey = pikkuFunc({
  scopes: ['plain:quoted'],
  func: async () => {},
})
export const oneOfTwo = pikkuFunc({
  scopes: ['plain:read', 'root'],
  func: async () => {},
})
export const parent = pikkuFunc({ scopes: ['admin'], func: async () => {} })
export const optedOut = pikkuFunc({
  scopes: ['admin:users:view'],
  func: async () => {},
})
export const plain = pikkuFunc({ scopes: ['plain:read'], func: async () => {} })
export const notLiteral = pikkuFunc({
  scopes: ['plain:computed'],
  func: async () => {},
})
export const none = pikkuFunc({ func: async () => {} })
