import { defineProvider } from '@pikku/core/provider'

// PKU376: same export name as ./basic.ts.
export const factoryForm = defineProvider(() => ({ other: 1 }))
