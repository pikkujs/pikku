import { pikkuService } from '@pikku/core/pikku-service'

export const deployVariant = async ({
  logger,
  kysely,
}: {
  logger: unknown
  kysely: unknown
}) => ({
  queue: kysely,
  queueMetrics: logger,
})

// PKU376: the exported name queue is already taken by ./flags.ts.
export const queue = pikkuService(() => ({ queue: 1 }))
