import { pikkuVoidFunc } from '#pikku/pikku-types.gen.js'

/**
 * Maintenance job function
 * Uses pikkuVoidFunc (alias for pikkuFuncSessionless<void, void>)
 * No auth needed - scheduled jobs are internal
 */
export const runMaintenance = pikkuVoidFunc({
  docs: {
    summary: 'Run daily maintenance tasks',
    description: 'Orchestrates data compaction, reindexing, and cleanup',
    tags: ['maintenance', 'scheduler'],
    errors: [],
  },
  // ✅ CORRECT: Destructure services, orchestrate via RPC
  func: async ({ rpc, logger }) => {
    logger.info('Starting maintenance tasks')

    await rpc.invoke('compactData', {})
    await rpc.invoke('reindexSearch', {})
    await rpc.invoke('pruneExpired', {})

    logger.info('Maintenance tasks completed')
  },
})

/**
 * Key rotation job
 */
export const rotateKeys = pikkuVoidFunc({
  docs: {
    summary: 'Rotate API keys',
    description: 'Weekly key rotation for security',
    tags: ['security', 'scheduler'],
    errors: [],
  },
  func: async ({ keyService, logger }) => {
    logger.info('Rotating keys')
    await keyService.rotate()
  },
})
