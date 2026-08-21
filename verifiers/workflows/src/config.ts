import { pikkuConfig } from '#pikku/setup'

/**
 * The postgres the db-backed runners share.
 *
 * They each open their own Kysely against it, but the workflow tables arrive
 * once, from `pikku db generate` + `pikku db migrate` — the runtime creates no
 * schema, so a runner that finds them missing stops rather than making them.
 */
export const connectionString =
  process.env.DATABASE_URL ??
  'postgres://postgres:password@localhost:5432/pikku_queue'

export const createConfig = pikkuConfig(async () => {
  return { postgresUrl: connectionString }
})
