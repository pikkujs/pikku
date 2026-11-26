import { pikkuService } from '@pikku/core/pikku-service'

/*
 * Outside `src/`, so `pikku all` does not read it as a real service: the shop's
 * tsconfig still compiles it.
 */
// @snippet start pikkuService
export const jobsQueue = pikkuService({
  dev: ({ logger }: { logger: { info: (message: string) => void } }) => ({
    queue: { enqueue: (name: string) => logger.info(`enqueue ${name}`) },
  }),
  deploy: ({}: object, env) => ({
    queue: {
      enqueue: (name: string) => {
        void fetch(`${env.JOBS_URL}/${name}`, { method: 'POST' })
      },
    },
  }),
})
// @snippet end pikkuService
