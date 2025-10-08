import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeChannelTypes } from './serialize-channel-types.js'

export const pikkuChannelTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig }) => {
    const { channelsTypesFile, functionTypesFile, packageMappings } = cliConfig

    const functionTypesImportPath = getFileImportRelativePath(
      channelsTypesFile,
      functionTypesFile,
      packageMappings
    )
    const content = serializeChannelTypes(functionTypesImportPath)
    await writeFileInDir(logger, channelsTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating channel types',
      commandEnd: 'Created channel types',
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
