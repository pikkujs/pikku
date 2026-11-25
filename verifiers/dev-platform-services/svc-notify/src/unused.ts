import { defineProvider } from '@pikku/core/provider'

/** Declared, never opted in to: its module must not appear in any generated file. */
export const unused = defineProvider({
  dev: () => ({ unused: true }),
})
