import { pikkuService } from '@pikku/core/pikku-service'

/** The stand-in for a project that reaches `noopQueue` instead of `queueClient`. */
export const queueNoop = pikkuService({
  dev: () => ({ noopQueue: { kind: 'noop', target: 'dev' } }),
  deploy: () => ({ noopQueue: { kind: 'noop', target: 'deploy' } }),
})
