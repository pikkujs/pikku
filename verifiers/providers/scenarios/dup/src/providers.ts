import { defineProvider } from '@pikku/core/provider'

export const dupA = defineProvider(() => ({ shared: 'a' }))
export const dupB = defineProvider(() => ({ shared: 'b' }))
