import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeRemoteRPC } from './serialize-remote-rpc.js'
import { isDeployCodegen } from '../../../utils/is-deploy-codegen.js'

export const pikkuRemoteRPC = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    if (await isDeployCodegen(variables)) {
      return false
    }

    if (config.remoteRpcWorkersFile && config.remoteRpcSchemasFile) {
      const leaf = (name: string) =>
        getLeafImportPath(config.remoteRpcWorkersFile!, name, config)
      const { schemas, functions } = serializeRemoteRPC(leaf)
      await writeFileInDir(logger, config.remoteRpcSchemasFile, schemas)
      await writeFileInDir(logger, config.remoteRpcWorkersFile, functions)
      await removeLegacyScaffoldFile(config.remoteRpcWorkersFile)
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
