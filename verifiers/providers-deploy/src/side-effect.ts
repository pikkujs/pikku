import { defineProvider } from '@pikku/core/provider'

// Never reached: its module's top-level side effect must not be bundled.
;(globalThis as { __pikkuHit?: number }).__pikkuHit = 1
export const unreached = defineProvider(() => ({ unreachedKey: 1 }))
