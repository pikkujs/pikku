import { pikkuConfig } from '#pikku/setup'

/**
 * The database the `pikku db` commands operate on.
 *
 * One project, either dialect, chosen by the environment — because the schema
 * sources differ per dialect in ways that matter. Better Auth gives `user.id` a
 * `uuid` on postgres and `text` on sqlite, and it was postgres that quietly
 * rejected the scope tables' foreign key for as long as it did.
 *
 * A file rather than `:memory:` on the sqlite side: `db generate`, `db migrate`,
 * `db check` and `db baseline` are separate CLI processes, so the thing under
 * test has to outlive any one of them.
 */
export const createConfig = pikkuConfig(async () => {
  const postgresUrl = process.env.PIKKU_VERIFIER_POSTGRES_URL
  return postgresUrl ? { postgresUrl } : { sqliteDb: '.pikku-runtime/dev.db' }
})
