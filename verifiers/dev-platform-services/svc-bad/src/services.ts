import { pikkuService } from '@pikku/core/pikku-service'

// Two services, same key, nothing to tell them apart.
export const dupA = pikkuService({ common: () => ({ shared: 'a' }) })
export const dupB = pikkuService({ common: () => ({ shared: 'b' }) })

// A need nothing provides.
export const needsGhost = pikkuService({
  common: ({ ghost }) => ({ ghostUser: ghost }),
})

// A cycle.
export const cycleA = pikkuService({
  common: ({ cycleB }) => ({ cycleA: cycleB }),
})
export const cycleB = pikkuService({
  common: ({ cycleA }) => ({ cycleB: cycleA }),
})
