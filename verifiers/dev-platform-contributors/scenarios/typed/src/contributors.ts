import { defineContributors } from '#pikku/contributor'
import type { Contributor } from '#pikku/contributor'

// `services` is this project's SingletonServices, so `logger` is a Logger and
// `ledger` is the Ledger declared in types/application-types.d.ts: nothing
// here is `any`.
export const ledgerDev: Contributor = {
  provides: ['ledger'],
  needs: ['logger'],
  run(services) {
    const { logger } = services
    services.ledger = { record: (event) => logger.info(event) }
  },
  async onServerStart(services) {
    services.ledger?.record('started')
  },
}

export const contributors = defineContributors({ ledger: { dev: ledgerDev } })
