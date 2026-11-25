import { defineProvider } from '@pikku/core/provider'

// PKU382: replaces lists a key no variant provides.
export const wrongReplaces = defineProvider({ replaces: ['x'], common: () => ({ y: 1 }) })
