import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeChannelTypes } from './serialize-channel-types.js'

export const pikkuChannelTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const {
      channelsTypesFile,
      functionTypesFile,
      middlewareTypesFile,
      packageMappings,
    } = config

    const functionTypesImportPath = getFileImportRelativePath(
      channelsTypesFile,
      functionTypesFile,
      packageMappings
    )
    const middlewareTypesImportPath = getFileImportRelativePath(
      channelsTypesFile,
      middlewareTypesFile,
      packageMappings
    )
    const content = serializeChannelTypes(
      functionTypesImportPath,
      middlewareTypesImportPath,
      getFileImportRelativePath(
        channelsTypesFile,
        config.authGuardsFile,
        packageMappings
      ),
      {
        addon: !!config.addon,
      }
    )
    await writeFileInDir(logger, channelsTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating channel types',
      commandEnd: 'Created channel types',
    }),
  ],
})
