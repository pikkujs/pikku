import { pikkuService } from '#pikku/service'

// `services` is this project's SingletonServices, so `logger` is a Logger and
// a service that needs `ledger` gets the Ledger declared in
// types/application-types.d.ts: nothing here is `any`.
export const ledger = pikkuService({
  common: ({ logger }) => ({
    ledger: { record: (event: string) => logger.info(event) },
  }),
  async onServerStart(services) {
    services.ledger.record('started')
  },
})
