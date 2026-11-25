import { defineProvider } from '@pikku/core/provider'

// PKU369: stage is not a variant.
export const staged = defineProvider({ stage: () => ({ x: 1 }) } as never)
