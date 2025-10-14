import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWebsocketWrapper } from './serialize-websocket-wrapper.js'

export const pikkuWebSocketTyped: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { websocketFile, channelsMapDeclarationFile, packageMappings } =
      config

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
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating websocket wrapper',
      commandEnd: 'Generated websocket wrapper',
      skipCondition: ({ config }) => config.websocketFile === undefined,
      skipMessage: "websocketFile isn't set in the pikku config",
    }),
  ],
})
