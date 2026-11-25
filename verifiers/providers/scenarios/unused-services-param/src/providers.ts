import { defineProvider } from '@pikku/core/provider'

// A provider that needs nothing leaves its first parameter unused, omits it, or
// destructures nothing: none of the three is a PKU371.
export const unusedParam = defineProvider((_services: object, env) => ({
  stampA: env.STAMP_A ?? 'a',
}))
export const noParam = defineProvider(() => ({ stampB: 'b' }))
export const emptyPattern = defineProvider(({}) => ({ stampC: 'c' }))
