import { PikkuCommandWithoutState } from '../../types.js'
import {
  logCommandInfoAndTime,
  getFileImportRelativePath,
  writeFileInDir,
} from '../../utils.js'
import { serializeWebsocketWrapper } from './serialize-websocket-wrapper.js'

export const pikkuWebSocketTyped: PikkuCommandWithoutState = async (
  logger,
  { websocketFile, channelsMapDeclarationFile, packageMappings }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Generating websocket wrapper',
    'Generated websocket wrapper',
    [
      websocketFile === undefined,
      "websocketFile isn't set in the pikku config",
    ],
    async () => {
      if (!websocketFile) {
        throw new Error("fetchFile is isn't set in the pikku config")
      }

      const channelsMapDeclarationPath = getFileImportRelativePath(
        websocketFile,
        channelsMapDeclarationFile,
        packageMappings
      )

      const content = [serializeWebsocketWrapper(channelsMapDeclarationPath)]
      await writeFileInDir(logger, websocketFile, content.join('\n'))
    }
  )
}
