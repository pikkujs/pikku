import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeMeshRPC } from './serialize-mesh-rpc.js'
import { isDeployCodegen } from '../../../utils/is-deploy-codegen.js'

export const pikkuMeshRPC = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    if (await isDeployCodegen(variables)) {
      return false
    }

    if (config.meshRpcWorkersFile && config.meshRpcSchemasFile) {
      const leaf = (name: string) =>
        getLeafImportPath(config.meshRpcWorkersFile!, name, config)
      const { schemas, functions } = serializeMeshRPC(leaf)
      await writeFileInDir(logger, config.meshRpcSchemasFile, schemas)
      await writeFileInDir(logger, config.meshRpcWorkersFile, functions)
      await removeLegacyScaffoldFile(config.meshRpcWorkersFile)
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Mesh RPC Workers',
      commandEnd: 'Generated Mesh RPC Workers',
    }),
  ],
})
