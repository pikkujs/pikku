import { defineProvider, defineWireProvider } from '@pikku/core/provider'

export const perRequest = defineWireProvider(() => ({ requestScope: { n: 1 } }))
// A singleton cannot need a key built per request.
export const bad = defineProvider(({ requestScope }) => ({ bad: requestScope }))
