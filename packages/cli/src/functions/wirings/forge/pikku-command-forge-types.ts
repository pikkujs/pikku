import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeForgeTypes } from './serialize-forge-types.js'

export const pikkuForgeTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const {
      forgeTypesFile,
      rpcInternalMapDeclarationFile,
      packageMappings,
      forge,
    } = config

    // Get the import path for the RPC map declaration file
    // The declaration file ends in .d.ts, but we need to import from .js
    // getFileImportRelativePath converts .ts -> .js, so .d.ts -> .d.js
    // We need to remove the extra .d extension
    let rpcMapImportPath = getFileImportRelativePath(
      forgeTypesFile,
      rpcInternalMapDeclarationFile,
      packageMappings
    )
    // Fix: .d.ts files should be imported as .js (TypeScript resolves types from .d.ts)
    rpcMapImportPath = rpcMapImportPath.replace('.d.js', '.js')

    const categories = forge?.node?.categories
    const content = serializeForgeTypes(rpcMapImportPath, categories)
    await writeFileInDir(logger, forgeTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating Forge types',
      commandEnd: 'Created Forge types',
    }),
  ],
})
