import {
  logCommandInfoAndTime,
  writeFileInDir,
  getFileImportRelativePath,
} from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeChannelTypes } from './serialize-channel-types.js'

export const pikkuChannelTypes: PikkuCommandWithoutState = async (
  logger,
  { channelsTypesFile, functionTypesFile, packageMappings }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating channel types',
    'Created channel types',
    [false],
    async () => {
      const functionTypesImportPath = getFileImportRelativePath(
        channelsTypesFile,
        functionTypesFile,
        packageMappings
      )
      const content = serializeChannelTypes(functionTypesImportPath)
      await writeFileInDir(logger, channelsTypesFile, content)
    }
  )
}
