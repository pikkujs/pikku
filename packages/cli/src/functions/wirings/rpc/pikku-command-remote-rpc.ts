import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeRemoteRPC } from './serialize-remote-rpc.js'
import { join } from 'path'

export const pikkuRemoteRPC: any = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    // Only generate remote RPC workers if:
    // 1. rpc.remoteRpcWorkersPath is configured
    // 2. AND the config doesn't extend from another config
    // This ensures only the base config generates the file, not extending configs
    if (config.rpc?.remoteRpcWorkersPath && !config.extends) {
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
