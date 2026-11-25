import { defineProvider } from '@pikku/core/provider'

declare const cond: boolean

// A union return provides every key; each is optional.
export const unionProvider = defineProvider(() => (cond ? { a: 1 } : { b: 2 }))

// A key typed T | undefined stays required.
export const requiredUndefined = defineProvider(() => ({
  c: undefined as number | undefined,
}))

// Conditional spread: k is optional.
export const conditionalSpread = defineProvider(() => ({
  ...(cond ? { k: 1 } : {}),
}))
