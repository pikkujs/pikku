import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { removeFileInDir, writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { cmsFiles, loadCmsModel } from './cms-project.js'
import { serializeCmsScopes } from './serialize-cms-scopes.js'
import { verifyCmsChecks } from './verify-cms-checks.js'

/**
 * Write what `db/cms.ts` declares. It runs before the first inspection and
 * reads nothing an inspection produces: a collection that was removed must not
 * leave functions behind that require its scopes.
 */
export const pikkuCms = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    // An addon publishes its collections for a host to generate.
    if (config.addon) return false

    const files = cmsFiles(config)
    const model = await loadCmsModel(config)
    if (!model) {
      for (const file of Object.values(files)) {
        await removeFileInDir(logger, file)
      }
      return false
    }

    await writeFileInDir(
      logger,
      files.scopes,
      serializeCmsScopes(
        model,
        getLeafImportPath(files.scopes, 'scopes', config)
      )
    )
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating CMS',
      commandEnd: 'Generated CMS',
    }),
  ],
})

/** Load the app's own checks, which needs the generated `#pikku` leaves. */
export const pikkuCmsChecks = pikkuSessionlessFunc<void, void>({
  func: async ({ config }) => {
    const model = await loadCmsModel(config)
    if (model) await verifyCmsChecks(config.rootDir, model)
  },
})
