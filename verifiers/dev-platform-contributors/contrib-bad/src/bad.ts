import type { Contributor } from '@pikku/core/contributors'

const providing = (key: string, needs: string[] = []): Contributor => ({
  provides: [key],
  needs,
  run: (services) => {
    services[key] = true
  },
})

// Two contributors, same key, nothing to tell them apart.
export const dupADev = providing('shared')
export const dupBDev = providing('shared')
// A need nothing provides.
export const ghostDev = providing('ghost-user', ['ghost'])
// A cycle.
export const cycleADev = providing('cycle-a', ['cycle-b'])
export const cycleBDev = providing('cycle-b', ['cycle-a'])
