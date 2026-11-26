import { pikkuSessionlessFunc } from '#pikku/function'
import { join } from 'node:path'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { removeFileInDir, writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  wiredAddons,
  type AddonDeclaration,
} from '../../db/addon-declarations.js'
import { verifyCmsHandlers } from './cms-addon.js'
import { cmsFiles, loadCmsModel } from './cms-project.js'
import { serializeCmsFunctions } from './serialize-cms-functions.js'
import { serializeCmsRuntime } from './serialize-cms-runtime.js'
import { serializeCmsSchemas } from './serialize-cms-schemas.js'
import { serializeCmsScopes } from './serialize-cms-scopes.js'
import { verifyCmsChecks } from './verify-cms-checks.js'

/**
 * Write what `db/cms.ts` declares. It runs before the first inspection and
 * reads nothing an inspection produces: a collection that was removed must not
 * leave functions behind that require its scopes.
 */
export const pikkuCms = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    // An addon publishes its collections for a host to generate.
    if (config.addon) return false

    const files = cmsFiles(config)
    // A setup-only inspection reads the `wireAddon` calls and checks nothing
    // against scopes, which may still name a collection that has just gone.
    const model = await loadCmsModel(config, async () =>
      wiredAddons(await getInspectorState(false, true))
    )
    if (!model) {
      for (const file of Object.values(files)) {
        await removeFileInDir(logger, file)
      }
      return false
    }

    const leaf = (from: string, name: string) =>
      getLeafImportPath(from, name, config)
    const sibling = (file: string) =>
      getFileImportRelativePath(files.functions, file, config.packageMappings)
    const schemas = serializeCmsSchemas(model)

    await writeFileInDir(
      logger,
      files.scopes,
      serializeCmsScopes(model, leaf(files.scopes, 'scopes'))
    )
    await writeFileInDir(logger, files.schemas, schemas)
    await writeFileInDir(
      logger,
      files.runtime,
      serializeCmsRuntime({ errorLeaf: leaf(files.runtime, 'error') })
    )
    await writeFileInDir(
      logger,
      files.functions,
      serializeCmsFunctions(
        model,
        {
          functionLeaf: leaf(files.functions, 'function'),
          authLeaf: leaf(files.functions, 'auth'),
          errorLeaf: leaf(files.functions, 'error'),
          schemas: sibling(files.schemas),
          runtime: sibling(files.runtime),
          checkModule: (module) => sibling(join(config.rootDir, module)),
        },
        [...schemas.matchAll(/^export const (\w+)/gm)].map((m) => m[1]!)
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
  func: async ({ config, getInspectorState }) => {
    let addons: AddonDeclaration[] = []
    const model = await loadCmsModel(config, async () => {
      addons = wiredAddons(await getInspectorState())
      return addons
    })
    if (!model) return
    await verifyCmsHandlers(config.rootDir, model, addons)
    await verifyCmsChecks(config.rootDir, model)
  },
})
