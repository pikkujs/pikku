import { defineProvider } from '@pikku/core/provider'

/**
 * Runs only for a target whose functions destructure `queueClient`. It needs
 * the target's own `queueService`, so a project that never reaches
 * `queueClient` neither runs this nor imports its module.
 */
export const queueReal = defineProvider({
  dev: ({ queueService }) => ({
    queueClient: { kind: 'real', target: 'dev', queueService },
  }),
  deploy: ({ queueService }) => ({
    queueClient: { kind: 'real', target: 'deploy', queueService },
  }),
})
