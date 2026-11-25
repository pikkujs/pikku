import { defineProvider } from '@pikku/core/provider'

// PKU372: the return type has no known keys.
export const anyReturn = defineProvider((): any => ({ x: 1 }))
export const indexReturn = defineProvider((): Record<string, number> => ({ x: 1 }))
