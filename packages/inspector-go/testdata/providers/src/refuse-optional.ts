import { defineProvider } from '@pikku/core/provider'

const keys = ['queueService']
// PKU378: optional is not an array of string literals.
export const dynamicOptional = defineProvider({ optional: keys, common: () => ({ x: 1 }) } as never)
// PKU378: optional lists a key no variant destructures.
export const unusedOptional = defineProvider({ optional: ['ghost'], common: () => ({ y: 1 }) })
