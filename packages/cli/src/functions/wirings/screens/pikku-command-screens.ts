import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  deriveScreensScopes,
  serializeScreensMeta,
  serializeScreens,
} from './serialize-screens.js'

export const pikkuScreens = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const { screensMetaJsonFile, screensFile, rootDir } = config
    if (!screensMetaJsonFile || !screensFile) {
      return false
    }

    const { screensManifest, functions } = await getInspectorState()
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
