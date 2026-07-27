import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku'
import { exportSchema } from '../db/local-db.js'

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
    const artifact = await exportSchema(config.rootDir)
    const dialects = Object.keys(artifact)

    if (dialects.length === 0) {
      logger.info(
        'db export: no db/sqlite or db/postgres migrations — nothing to publish'
      )
      return
    }

    const file = join(config.outDir, 'db', 'pikku-db-meta.gen.json')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')

    logger.info(`db export: wrote ${file} for ${dialects.join(', ')}`)
    logger.info(
      '  Ship it with the package — a consumer resolves it through the package name.'
    )
  },
})
