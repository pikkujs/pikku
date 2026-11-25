import { pikkuSessionlessFunc } from '#pikku/function'
import { removeFileInDir, writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeProvidersMeta } from './serialize-providers-meta.js'

/**
 * Writes the addon's providers meta, which a host reads to opt in with
 * `wireAddon({ providers })`. A package that declares none gets no file, and a
 * stale one is removed.
 */
export const providersMeta = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const { providersMetaJsonFile, rootDir } = config
    if (!providersMetaJsonFile) return false

    const { providers } = await getInspectorState()
    if (!providers || Object.keys(providers).length === 0) {
      await removeFileInDir(logger, providersMetaJsonFile, {
        logRemove: false,
      })
      return false
    }
    await writeFileInDir(
      logger,
      providersMetaJsonFile,
      serializeProvidersMeta(providers, rootDir)
    )
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating providers meta',
      commandEnd: 'Generated providers meta',
    }),
  ],
})
