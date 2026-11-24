import { pikkuSessionlessFunc } from '#pikku/function'
import { removeFileInDir, writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePikkuServicesMeta } from './serialize-pikku-services-meta.js'

/**
 * Writes the addon's services meta, which a host reads to opt in with
 * `wireAddon({ services })`. A package that declares none gets no file, and a
 * stale one is removed.
 */
export const pikkuServicesMeta = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const { pikkuServicesMetaJsonFile, rootDir } = config
    if (!pikkuServicesMetaJsonFile) return false

    const { pikkuServices } = await getInspectorState()
    if (!pikkuServices || Object.keys(pikkuServices).length === 0) {
      await removeFileInDir(logger, pikkuServicesMetaJsonFile, {
        logRemove: false,
      })
      return false
    }
    await writeFileInDir(
      logger,
      pikkuServicesMetaJsonFile,
      serializePikkuServicesMeta(pikkuServices, rootDir)
    )
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating services meta',
      commandEnd: 'Generated services meta',
    }),
  ],
})
