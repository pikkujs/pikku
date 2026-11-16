import { pikkuSessionlessFunc } from '#pikku/function'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  deriveScreensScopes,
  serializeScreensMeta,
  serializeScreens,
  serializeAddonRoles,
  serializeInstalledAddons,
  serializePluginTypes,
  catalogMessageKeys,
} from './serialize-screens.js'

export const pikkuScreens = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const {
      screensMetaJsonFile,
      screensFile,
      installedAddonsFile,
      addonRolesFile,
      pluginTypesFile,
      rpcInternalMapDeclarationFile,
      packageMappings,
      rootDir,
    } = config
    // An addon's typed definePlugin. Written whether or not it declares
    // screens yet: it is what the declaration imports.
    if (config.addon && pluginTypesFile) {
      const en = await readFile(
        join(rootDir, 'messages', 'en.json'),
        'utf8'
      ).catch(() => undefined)
      await writeFileInDir(
        logger,
        pluginTypesFile,
        serializePluginTypes(
          getFileImportRelativePath(
            pluginTypesFile,
            rpcInternalMapDeclarationFile,
            packageMappings
          ),
          catalogMessageKeys(en)
        )
      )
    }
    if (!screensMetaJsonFile || !screensFile) {
      return false
    }

    const { studio, addonStudio, functions, rpc } = await getInspectorState()
    if (installedAddonsFile && addonRolesFile && addonStudio) {
      const installed = Object.entries(addonStudio).map(([name, manifest]) => {
        const declaration = rpc.wireAddonDeclarations.get(name)!
        return {
          name,
          package: declaration.local?.package ?? declaration.package,
          manifest,
        }
      })
      await writeFileInDir(
        logger,
        installedAddonsFile,
        serializeInstalledAddons(installed)
      )
      await writeFileInDir(
        logger,
        addonRolesFile,
        serializeAddonRoles(installed)
      )
    }
    if (!studio) {
      return false
    }

    await writeFileInDir(
      logger,
      screensMetaJsonFile,
      serializeScreensMeta(studio, rootDir, deriveScreensScopes(functions.meta))
    )
    await writeFileInDir(
      logger,
      screensFile,
      serializeScreens(studio, screensFile)
    )
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating addon screens',
      commandEnd: 'Generated addon screens',
    }),
  ],
})
