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
import { verifyCollectionHandlers } from './collection-addon.js'
import { collectionFiles, loadCollectionsModel } from './collection-project.js'
import { serializeCollectionFunctions } from './serialize-collection-functions.js'
import { serializeCollectionRuntime } from './serialize-collection-runtime.js'
import { serializeCollectionSchemas } from './serialize-collection-schemas.js'
import { serializeCollectionScopes } from './serialize-collection-scopes.js'
import { verifyCollectionChecks } from './verify-collection-checks.js'

/**
 * Write what `db/collections.ts` declares. It runs before the first inspection and
 * reads nothing an inspection produces: a collection that was removed must not
 * leave functions behind that require its scopes.
 */
export const pikkuCollection = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    // An addon publishes its collections for a host to generate.
    if (config.addon) return false

    const files = collectionFiles(config)
    // A setup-only inspection reads the `wireAddon` calls and checks nothing
    // against scopes, which may still name a collection that has just gone.
    const model = await loadCollectionsModel(config, async () =>
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
    const schemas = serializeCollectionSchemas(model)

    await writeFileInDir(
      logger,
      files.scopes,
      serializeCollectionScopes(model, leaf(files.scopes, 'scopes'))
    )
    await writeFileInDir(logger, files.schemas, schemas)
    await writeFileInDir(
      logger,
      files.runtime,
      serializeCollectionRuntime({ errorLeaf: leaf(files.runtime, 'error') })
    )
    await writeFileInDir(
      logger,
      files.functions,
      serializeCollectionFunctions(
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
      commandStart: 'Generating collections',
      commandEnd: 'Generated collections',
    }),
  ],
})

/** Load the app's own checks, which needs the generated `#pikku` leaves. */
export const pikkuCollectionChecks = pikkuSessionlessFunc<void, void>({
  func: async ({ config, getInspectorState }) => {
    let addons: AddonDeclaration[] = []
    const model = await loadCollectionsModel(config, async () => {
      addons = wiredAddons(await getInspectorState())
      return addons
    })
    if (!model) return
    await verifyCollectionHandlers(config.rootDir, model, addons)
    await verifyCollectionChecks(config.rootDir, model)
  },
})
