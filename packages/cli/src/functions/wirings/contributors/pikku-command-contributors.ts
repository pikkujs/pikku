import { pikkuSessionlessFunc } from '#pikku/function'
import { removeFileInDir, writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeContributorsMeta } from './serialize-contributors-meta.js'

/**
 * Writes the addon's contributors meta, which a host reads to opt in with
 * `wireAddon({ contributors })`. A package that registers none gets no file,
 * and a stale one is removed.
 */
export const pikkuContributors = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const { contributorsMetaJsonFile, rootDir } = config
    if (!contributorsMetaJsonFile) return false

    const { contributorsManifest } = await getInspectorState()
    if (!contributorsManifest) {
      await removeFileInDir(logger, contributorsMetaJsonFile, {
        logRemove: false,
      })
      return false
    }
    await writeFileInDir(
      logger,
      contributorsMetaJsonFile,
      serializeContributorsMeta(contributorsManifest, rootDir)
    )
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating contributors meta',
      commandEnd: 'Generated contributors meta',
    }),
  ],
})
