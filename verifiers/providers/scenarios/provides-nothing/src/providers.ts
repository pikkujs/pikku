import { defineProvider } from '@pikku/core/provider'

// Returns no key and has no addTo: nothing could ever select it.
export const empty = defineProvider(() => ({}))
