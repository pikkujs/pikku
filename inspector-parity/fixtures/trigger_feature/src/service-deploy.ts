import { defineProvider } from '@pikku/core/provider'

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
export const queue = defineProvider(() => ({ queue: 1 }))
