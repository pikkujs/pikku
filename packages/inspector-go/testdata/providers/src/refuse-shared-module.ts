import { defineProvider } from '@pikku/core/provider'

// PKU375: two variants exported from one module.
export const sharedA = ({ logger }: { logger: unknown }) => ({ a: logger })
export const sharedB = ({ logger }: { logger: unknown }) => ({ a: logger })
export const twoVariants = defineProvider({ dev: sharedA, deploy: sharedB })
