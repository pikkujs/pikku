import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeTypedRPCMap } from './serialize-typed-rpc-map.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuRPCInternalMap = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { functions, rpc, resolvedIOTypes } = await getInspectorState()
    const {
      rpcInternalMapDeclarationFile,
      packageMappings,
      addons,
      workflowMapDeclarationFile,
      agentMapDeclarationFile,
    } = config

    const workflowMapPath = getFileImportRelativePath(
      rpcInternalMapDeclarationFile,
      workflowMapDeclarationFile,
      packageMappings
    )

    const agentMapPath = getFileImportRelativePath(
      rpcInternalMapDeclarationFile,
      agentMapDeclarationFile,
      packageMappings
    )

    const content = serializeTypedRPCMap(
      logger,
      rpcInternalMapDeclarationFile,
      packageMappings,
      functions.typesMap,
      rpc.internalMeta,
      resolvedIOTypes,
      addons,
      workflowMapPath,
      agentMapPath
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

export const pikkuRPCExposedMap = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { functions, rpc, resolvedIOTypes } = await getInspectorState()
    const {
      rpcMapDeclarationFile,
      packageMappings,
      addons,
      workflowMapDeclarationFile,
      agentMapDeclarationFile,
    } = config

    const workflowMapPath = getFileImportRelativePath(
      rpcMapDeclarationFile,
      workflowMapDeclarationFile,
      packageMappings
    )

    const agentMapPath = getFileImportRelativePath(
      rpcMapDeclarationFile,
      agentMapDeclarationFile,
      packageMappings
    )

    const content = serializeTypedRPCMap(
      logger,
      rpcMapDeclarationFile,
      packageMappings,
      functions.typesMap,
      rpc.exposedMeta,
      resolvedIOTypes,
      addons,
      workflowMapPath,
      agentMapPath
    )
    await writeFileInDir(logger, rpcMapDeclarationFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating RPC addon map',
      commandEnd: 'Created RPC addon map',
    }),
  ],
})
