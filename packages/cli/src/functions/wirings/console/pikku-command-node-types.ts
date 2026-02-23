import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeNodeTypes } from './serialize-node-types.js'

export const pikkuNodeTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const {
      nodeTypesFile,
      rpcInternalMapDeclarationFile,
      packageMappings,
      node,
    } = config

    let rpcMapImportPath = getFileImportRelativePath(
      nodeTypesFile,
      rpcInternalMapDeclarationFile,
      packageMappings
    )
    rpcMapImportPath = rpcMapImportPath.replace('.d.js', '.js')

    const categories = node?.categories
    const content = serializeNodeTypes(rpcMapImportPath, categories)
    await writeFileInDir(logger, nodeTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating Node types',
      commandEnd: 'Created Node types',
    }),
  ],
})
