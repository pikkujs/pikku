import { defineProvider } from '@pikku/core/provider'

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
