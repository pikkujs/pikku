import { defineProvider } from '@pikku/core/provider'

// PKU377: deploy:fly is not a variant.
export const fly = defineProvider({ 'deploy:fly': () => ({ x: 1 }) } as never)
