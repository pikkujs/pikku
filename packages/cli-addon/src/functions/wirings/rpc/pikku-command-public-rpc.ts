import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePublicRPC } from './serialize-public-rpc.js'

export const pikkuPublicRPC = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    const deployCodegenFlag = await variables.get('PIKKU_DEPLOY_CODEGEN')
    if (deployCodegenFlag === '1') {
      return false
    }

    if (config.scaffold?.rpc) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.publicRpcFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        config.publicRpcFile,
        serializePublicRPC(
          pathToPikkuTypes,
          config.scaffold.rpc === 'auth',
          config.globalHTTPPrefix || ''
        )
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Public RPC Endpoint',
      commandEnd: 'Generated Public RPC Endpoint',
    }),
  ],
})
