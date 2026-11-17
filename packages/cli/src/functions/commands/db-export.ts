import { pikkuSessionlessFunc } from '#pikku/function'
import { writeAddonDeclaration } from '../db/addon-declarations.js'

/**
 * Publish this package's table declaration so a project consuming it as an
 * addon can create its tables.
 *
 * An addon has no database of its own: it runs inside the consumer, against the
 * consumer's, so it must never create tables at boot. It declares what it needs
 * in `db/tables.ts`, and the consumer's `db generate` folds that into its own
 * migration history, where the project can review it like any other migration.
 *
 * Run this from the addon's build, beside the rest of its codegen.
 */
export const dbExport = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    const { file, tables } = await writeAddonDeclaration(
      config.rootDir,
      config.outDir
    )

    if (tables.length === 0) {
      logger.info(
        `db export: no tables declared in db/tables.ts, wrote ${file} empty, ` +
          'which is how a consumer tells "no tables" from "never published"'
      )
      return
    }

    logger.info(`db export: wrote ${file} for ${tables.join(', ')}`)
    logger.info(
      '  Ship it with the package: a consumer resolves it through the package name.'
    )
  },
})
