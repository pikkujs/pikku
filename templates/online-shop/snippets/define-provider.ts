import {
  defineProvider,
  defineProviderCollection,
  defineWireProvider,
} from '@pikku/core/provider'

/*
 * Outside `src/`, so `pikku all` does not read it as a real service: the shop's
 * tsconfig still compiles it.
 */
// @snippet start defineProvider
export const jobsQueue = defineProvider({
  dev: ({ logger }: { logger: { info: (message: string) => void } }) => ({
    queue: { enqueue: (name: string) => logger.info(`enqueue ${name}`) },
  }),
  deploy: (_services: object, env) => ({
    queue: {
      enqueue: (name: string) => {
        void fetch(`${env.JOBS_URL}/${name}`, { method: 'POST' })
      },
    },
  }),
})
// @snippet end defineProvider

// @snippet start defineWireProvider
export const requestId = defineWireProvider(
  ({ logger }: { logger: object }, wire) => ({
    requestId: { logger, wire },
  })
)
// @snippet end defineWireProvider

// @snippet start defineProviderCollection
export const exportSinks = defineProviderCollection<
  'exportSinks',
  { name: string }
>('exportSinks')
// @snippet end defineProviderCollection
