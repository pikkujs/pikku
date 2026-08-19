import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializePublicRPC } from './serialize-public-rpc.js'
import { resolveScaffoldFeature } from '../../../utils/resolve-scaffold-feature.js'
import { isDeployCodegen } from '../../../utils/is-deploy-codegen.js'

export const pikkuPublicRPC = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    if (await isDeployCodegen(variables)) {
      return false
    }

    if (config.scaffold?.rpc && config.publicRpcSchemasFile) {
      const leaf = (name: string) =>
        getLeafImportPath(config.publicRpcFile, name, config)
      const { schemas, functions } = serializePublicRPC(
        leaf,
        resolveScaffoldFeature('rpc', config.scaffold.rpc).auth,
        config.globalHTTPPrefix || ''
      )
      await writeFileInDir(logger, config.publicRpcSchemasFile, schemas)
      await writeFileInDir(logger, config.publicRpcFile, functions)
      await removeLegacyScaffoldFile(config.publicRpcFile)
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
