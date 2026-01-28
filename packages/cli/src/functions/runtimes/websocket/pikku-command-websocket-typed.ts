import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWebsocketWrapper } from './serialize-websocket-wrapper.js'

export const pikkuWebSocketTyped = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { websocketFile, channelsMapDeclarationFile, packageMappings } =
      config

    // If websocketFile is not set, clean up any existing file and return
    if (!websocketFile) {
      logger.debug({
        message:
          "Skipping generating websocket wrapper since websocketFile isn't set in the pikku config.",
        type: 'skip',
      })
      return
    }

    const channelsMapDeclarationPath = getFileImportRelativePath(
      websocketFile,
      channelsMapDeclarationFile,
      packageMappings
    )

    const content = [serializeWebsocketWrapper(channelsMapDeclarationPath)]
    await writeFileInDir(logger, websocketFile, content.join('\n'))
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating websocket wrapper',
      commandEnd: 'Generated websocket wrapper',
    }),
  ],
})
