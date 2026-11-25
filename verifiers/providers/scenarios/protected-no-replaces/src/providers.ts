import { defineProvider } from '@pikku/core/provider'

// logger is protected: providing it needs replaces: ['logger'].
export const loud = defineProvider(() => ({ logger: console as never }))
