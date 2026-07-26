import { pikkuConfig } from '#pikku'

/**
 * The database the `pikku db` commands operate on.
 *
 * A file rather than `:memory:` on purpose — `db generate`, `db migrate`,
 * `db check` and `db baseline` are separate CLI processes, so the thing under
 * test has to outlive any one of them.
 */
export const createConfig = pikkuConfig(async () => ({
  sqliteDb: '.pikku-runtime/dev.db',
}))
