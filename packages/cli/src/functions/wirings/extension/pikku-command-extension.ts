import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  deriveExtensionScopes,
  serializeExtensionMeta,
  serializeExtensionScreens,
} from './serialize-extension.js'

export const pikkuExtension = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const { extensionMetaJsonFile, extensionScreensFile, rootDir } = config
    if (!extensionMetaJsonFile || !extensionScreensFile) {
      return false
    }

    const { extensionManifest, functions } = await getInspectorState()
    if (!extensionManifest) {
      return false
    }

    await writeFileInDir(
      logger,
      extensionMetaJsonFile,
      serializeExtensionMeta(
        extensionManifest,
        rootDir,
        deriveExtensionScopes(functions.meta)
      )
    )
    await writeFileInDir(
      logger,
      extensionScreensFile,
      serializeExtensionScreens(extensionManifest, extensionScreensFile)
    )
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating extension screens',
      commandEnd: 'Generated extension screens',
    }),
  ],
})
