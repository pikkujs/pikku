import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  deriveScreensScopes,
  serializeScreensMeta,
  serializeScreens,
  serializeAddonRoles,
  serializeInstalledAddons,
} from './serialize-screens.js'

export const pikkuScreens = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const {
      screensMetaJsonFile,
      screensFile,
      installedAddonsFile,
      addonRolesFile,
      rootDir,
    } = config
    if (!screensMetaJsonFile || !screensFile) {
      return false
    }

    const { screensManifest, addonScreens, functions, rpc } =
      await getInspectorState()
    if (installedAddonsFile && addonRolesFile && addonScreens) {
      const installed = Object.entries(addonScreens).map(
        ([name, manifest]) => ({
          name,
          package: rpc.wireAddonDeclarations.get(name)!.package,
          manifest,
        })
      )
      await writeFileInDir(
        logger,
        installedAddonsFile,
        serializeInstalledAddons(installed)
      )
      await writeFileInDir(logger, addonRolesFile, serializeAddonRoles(installed))
    }
    if (!screensManifest) {
      return false
    }

    await writeFileInDir(
      logger,
      screensMetaJsonFile,
      serializeScreensMeta(
        screensManifest,
        rootDir,
        deriveScreensScopes(functions.meta)
      )
    )
    await writeFileInDir(
      logger,
      screensFile,
      serializeScreens(screensManifest, screensFile)
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
