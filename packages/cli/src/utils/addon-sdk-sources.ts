import type { InspectorState } from '@pikku/inspector'
import type { Logger } from '@pikku/core/services'
import { serializeCustomTypesFile } from './custom-types-file.js'
import { getFileImportRelativePath } from './file-import-path.js'
import { pruneTypesMap, type SdkSources } from './addon-sdk.js'
import { serializeTypedRPCMap } from '../functions/wirings/rpc/serialize-typed-rpc-map.js'
import { serializeWorkflowMap } from '../functions/wirings/workflow/serialize-workflow-map.js'
import { serializeAgentMap } from '../functions/wirings/agent/serialize-agent-map.js'

export interface SdkSourcePaths {
  packageMappings: Record<string, string>
  rpcRemoteMapDeclarationFile: string
  workflowMapDeclarationFile: string
  agentMapDeclarationFile: string
  customTypesDeclarationFile: string
  functionsMetaJsonFile: string
  schemaDirectory: string
}

/**
 * The SDK's maps, serialized for its surface alone: the remote RPCs and the
 * exposed workflows, over a types map holding only the types those reach.
 * Agents and graphs have no `expose`, so none of them is on it. The addon's own
 * generated maps describe its whole app, internal functions included, and
 * cannot be shipped as they are.
 */
export const serializeSdkSources = (
  logger: Logger,
  state: Pick<
    InspectorState,
    'functions' | 'rpc' | 'resolvedIOTypes' | 'workflows'
  >,
  paths: SdkSourcePaths
): SdkSources => {
  const { functions, rpc, resolvedIOTypes, workflows } = state
  const {
    packageMappings,
    rpcRemoteMapDeclarationFile,
    workflowMapDeclarationFile,
    agentMapDeclarationFile,
    customTypesDeclarationFile,
  } = paths

  const exposedWorkflows = Object.fromEntries(
    Object.entries(workflows.meta).filter(
      ([, meta]) => meta.expose === true && !meta.scenario
    )
  )
  const typesMap = pruneTypesMap(functions.typesMap, [
    ...Object.values(rpc.remoteMeta).flatMap((id) => {
      const io = resolvedIOTypes[id]
      return io ? [io.inputType, io.outputType] : []
    }),
    ...Object.values(exposedWorkflows).flatMap(({ pikkuFuncId }) => [
      ...(functions.meta[pikkuFuncId]?.inputs ?? []),
      ...(functions.meta[pikkuFuncId]?.outputs ?? []),
    ]),
  ])

  return {
    rpcMap: {
      path: rpcRemoteMapDeclarationFile,
      content: serializeTypedRPCMap(
        logger,
        rpcRemoteMapDeclarationFile,
        packageMappings,
        typesMap,
        rpc.remoteMeta,
        resolvedIOTypes,
        customTypesDeclarationFile,
        undefined,
        getFileImportRelativePath(
          rpcRemoteMapDeclarationFile,
          workflowMapDeclarationFile,
          packageMappings
        ),
        getFileImportRelativePath(
          rpcRemoteMapDeclarationFile,
          agentMapDeclarationFile,
          packageMappings
        )
      ),
    },
    workflowMap: {
      path: workflowMapDeclarationFile,
      content: serializeWorkflowMap(
        logger,
        workflowMapDeclarationFile,
        packageMappings,
        typesMap,
        functions.meta,
        exposedWorkflows,
        {},
        customTypesDeclarationFile
      ),
    },
    agentMap: {
      path: agentMapDeclarationFile,
      content: serializeAgentMap(
        logger,
        agentMapDeclarationFile,
        packageMappings,
        typesMap,
        {},
        customTypesDeclarationFile
      ),
    },
    customTypes: {
      path: customTypesDeclarationFile,
      content: serializeCustomTypesFile(
        customTypesDeclarationFile,
        packageMappings,
        typesMap
      ),
    },
    functionsMeta: paths.functionsMetaJsonFile,
    schemaDirectory: paths.schemaDirectory,
  }
}
