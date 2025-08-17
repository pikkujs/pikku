import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { PikkuCommand } from '../../types.js'

export const pikkuRPC: PikkuCommand = async (
  logger,
  { rpcInternalWiringMetaFile, rpcWiringMetaFile },
  { rpc }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Finding RPCs tasks',
    'Found RPCs',
    [false],
    async () => {
      if (rpc.internalFiles.size > 0) {
        await writeFileInDir(
          logger,
          rpcInternalWiringMetaFile,
          `import { pikkuState } from '@pikku/core'\npikkuState('rpc', 'meta', ${JSON.stringify(rpc.internalMeta, null, 2)})`
        )
      }

      if (rpc.exposedFiles.size > 0) {
        await writeFileInDir(
          logger,
          rpcWiringMetaFile,
          `import { pikkuState } from '@pikku/core'\npikkuState('rpc', 'meta', ${JSON.stringify(rpc.exposedFiles, null, 2)})`
        )
      }
    }
  )
}
