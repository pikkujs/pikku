import { defineProvider } from '@pikku/core/provider'

// Two services, same key, nothing to tell them apart.
export const dupA = defineProvider({ common: () => ({ shared: 'a' }) })
export const dupB = defineProvider({ common: () => ({ shared: 'b' }) })

// A need nothing provides.
export const needsGhost = defineProvider({
  common: ({ ghost }) => ({ ghostUser: ghost }),
})

// A cycle.
export const cycleA = defineProvider({
  common: ({ cycleB }) => ({ cycleA: cycleB }),
})
export const cycleB = defineProvider({
  common: ({ cycleA }) => ({ cycleB: cycleA }),
})
