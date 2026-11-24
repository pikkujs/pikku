import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeAttentionTypes } from './serialize-attention-types.js'

export const pikkuAttentionTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { attentionTypesFile, functionTypesFile, packageMappings } = config
    await writeFileInDir(
      logger,
      attentionTypesFile,
      serializeAttentionTypes(
        getFileImportRelativePath(
          attentionTypesFile,
          functionTypesFile,
          packageMappings
        )
      )
    )
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating attention func types',
      commandEnd: 'Created attention func types',
    }),
  ],
})
