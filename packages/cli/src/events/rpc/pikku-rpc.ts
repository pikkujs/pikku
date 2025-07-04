import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { PikkuCommand } from '../../types.js'

export const pikkuRPC: PikkuCommand = async (
  logger,
  { rpcMetaFile },
  { rpc }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Finding RPCs tasks',
    'Found RPCs',
    [false],
    async () => {
      await writeFileInDir(
        logger,
        rpcMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('rpc', 'meta', ${JSON.stringify(rpc.meta, null, 2)})`
      )
    }
  )
}
