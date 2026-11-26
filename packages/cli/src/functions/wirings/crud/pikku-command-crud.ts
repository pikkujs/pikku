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
import { verifyCrudHandlers } from './crud-addon.js'
import { crudFiles, loadCrudModel } from './crud-project.js'
import { serializeCrudFunctions } from './serialize-crud-functions.js'
import { serializeCrudRuntime } from './serialize-crud-runtime.js'
import { serializeCrudSchemas } from './serialize-crud-schemas.js'
import { serializeCrudScopes } from './serialize-crud-scopes.js'
import { verifyCrudChecks } from './verify-crud-checks.js'

/**
 * Write what `db/crud.ts` declares. It runs before the first inspection and
 * reads nothing an inspection produces: a collection that was removed must not
 * leave functions behind that require its scopes.
 */
export const pikkuCrud = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    // An addon publishes its collections for a host to generate.
    if (config.addon) return false

    const files = crudFiles(config)
    // A setup-only inspection reads the `wireAddon` calls and checks nothing
    // against scopes, which may still name a collection that has just gone.
    const model = await loadCrudModel(config, async () =>
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
    const schemas = serializeCrudSchemas(model)

    await writeFileInDir(
      logger,
      files.scopes,
      serializeCrudScopes(model, leaf(files.scopes, 'scopes'))
    )
    await writeFileInDir(logger, files.schemas, schemas)
    await writeFileInDir(
      logger,
      files.runtime,
      serializeCrudRuntime({ errorLeaf: leaf(files.runtime, 'error') })
    )
    await writeFileInDir(
      logger,
      files.functions,
      serializeCrudFunctions(
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
      commandStart: 'Generating CRUD',
      commandEnd: 'Generated CRUD',
    }),
  ],
})

/** Load the app's own checks, which needs the generated `#pikku` leaves. */
export const pikkuCrudChecks = pikkuSessionlessFunc<void, void>({
  func: async ({ config, getInspectorState }) => {
    let addons: AddonDeclaration[] = []
    const model = await loadCrudModel(config, async () => {
      addons = wiredAddons(await getInspectorState())
      return addons
    })
    if (!model) return
    await verifyCrudHandlers(config.rootDir, model, addons)
    await verifyCrudChecks(config.rootDir, model)
  },
})
