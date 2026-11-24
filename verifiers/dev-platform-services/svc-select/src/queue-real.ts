import { pikkuService } from '@pikku/core/pikku-service'

/**
 * Runs only for a target whose functions destructure `queueClient`. It needs
 * the target's own `queueService`, so a project that never reaches
 * `queueClient` neither runs this nor imports its module.
 */
export const queueReal = pikkuService({
  dev: ({ queueService }) => ({
    queueClient: { kind: 'real', target: 'dev', queueService },
  }),
  deploy: ({ queueService }) => ({
    queueClient: { kind: 'real', target: 'deploy', queueService },
  }),
})
