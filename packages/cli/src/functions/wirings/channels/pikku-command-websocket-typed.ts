import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import {
  getFileImportRelativePath,
  writeFileInDir,
} from '../../../utils/utils.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWebsocketWrapper } from './serialize-websocket-wrapper.js'

export const pikkuWebSocketTyped = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig }) => {
    const { websocketFile, channelsMapDeclarationFile, packageMappings } =
      cliConfig

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
      skipCondition: ({ cliConfig }) => cliConfig.websocketFile === undefined,
      skipMessage: "websocketFile isn't set in the pikku config",
    }),
  ],
})
