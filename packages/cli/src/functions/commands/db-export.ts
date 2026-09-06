import { pikkuSessionlessFunc } from '#pikku/function'
import { writeSchemaArtifact } from '../db/local-db.js'

/**
 * Publish this package's schema so a project consuming it as an addon can
 * create its tables.
 *
 * An addon has no database of its own — it runs inside the consumer, against
 * the consumer's — so it must never create tables at boot. It says what it
 * needs, and the consumer's `db generate` folds that into its own migration
 * history, where the project can review it like any other migration.
 *
 * Run this from the addon's build, beside the rest of its codegen.
 */
export const dbExport = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    const { file, dialects } = await writeSchemaArtifact(
      config.rootDir,
      config.outDir,
      config.db?.pgliteExtensions
    )

    if (dialects.length === 0) {
      logger.info(
        `db export: no db/sqlite or db/postgres migrations — wrote ${file} empty, ` +
          'which is how a consumer tells "no tables" from "never published"'
      )
      return
    }

    logger.info(`db export: wrote ${file} for ${dialects.join(', ')}`)
    logger.info(
      '  Ship it with the package — a consumer resolves it through the package name.'
    )
  },
})
