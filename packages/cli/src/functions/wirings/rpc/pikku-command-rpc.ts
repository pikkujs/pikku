import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuRPC: any = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const { rpc } = await getInspectorState()
    const { rpcInternalWiringMetaFile } = config

    if (rpc.internalFiles.size > 0) {
      await writeFileInDir(
        logger,
        rpcInternalWiringMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('rpc', 'meta', ${JSON.stringify(rpc.internalMeta, null, 2)})`
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding RPCs tasks',
      commandEnd: 'Found RPCs',
    }),
  ],
})
