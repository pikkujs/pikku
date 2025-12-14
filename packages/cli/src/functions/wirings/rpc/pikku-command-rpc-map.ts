import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeTypedRPCMap } from './serialize-typed-rpc-map.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuRPCInternalMap: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { functions, rpc } = await getInspectorState()
    const {
      rpcInternalMapDeclarationFile,
      packageMappings,
      externalPackages,
      workflowMapDeclarationFile,
    } = config

    const workflowMapPath = getFileImportRelativePath(
      rpcInternalMapDeclarationFile,
      workflowMapDeclarationFile,
      packageMappings
    )

    const content = serializeTypedRPCMap(
      logger,
      rpcInternalMapDeclarationFile,
      packageMappings,
      functions.typesMap,
      functions.meta,
      rpc.internalMeta,
      externalPackages,
      workflowMapPath
    )
    await writeFileInDir(logger, rpcInternalMapDeclarationFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating RPC internal map',
      commandEnd: 'Created RPC internal map',
    }),
  ],
})

export const pikkuRPCExposedMap: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { functions, rpc } = await getInspectorState()
    const {
      rpcMapDeclarationFile,
      packageMappings,
      externalPackages,
      workflowMapDeclarationFile,
    } = config

    const workflowMapPath = getFileImportRelativePath(
      rpcMapDeclarationFile,
      workflowMapDeclarationFile,
      packageMappings
    )

    const content = serializeTypedRPCMap(
      logger,
      rpcMapDeclarationFile,
      packageMappings,
      functions.typesMap,
      functions.meta,
      rpc.exposedMeta,
      externalPackages,
      workflowMapPath
    )
    await writeFileInDir(logger, rpcMapDeclarationFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating RPC external map',
      commandEnd: 'Created RPC external map',
    }),
  ],
})
