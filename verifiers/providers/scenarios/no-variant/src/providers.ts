import { defineProvider } from '@pikku/core/provider'

// Only a dev variant, reached on a deploy target, and not in the deploy baseline.
export const devOnly = defineProvider({ dev: () => ({ devOnly: 'x' }) })
