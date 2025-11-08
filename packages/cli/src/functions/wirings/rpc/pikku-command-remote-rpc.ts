import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeRemoteRPC } from './serialize-remote-rpc.js'
import { join } from 'path'

export const pikkuRemoteRPC: any = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.rpc?.remoteRpcWorkersPath) {
      const remoteRpcPath = join(
        config.rootDir,
        config.rpc.remoteRpcWorkersPath
      )
      await writeFileInDir(logger, remoteRpcPath, serializeRemoteRPC())
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Remote RPC Workers',
      commandEnd: 'Generated Remote RPC Workers',
    }),
  ],
})
