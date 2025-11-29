import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { ErrorCode } from '@pikku/inspector'
import { convertAllDstToGraphs } from '@pikku/inspector/workflow-graph'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWorkflowTypes } from './serialize-workflow-types.js'
import { serializeWorkflowRegistration } from './serialize-workflow-registration.js'
import { serializeWorkflowMap } from './serialize-workflow-map.js'
import { serializeWorkflowWorkers } from './serialize-workflow-workers.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { join } from 'path'

export const pikkuWorkflow: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      workflowsWiringFile,
      workflowGraphsMetaJsonFile,
      workflowMapDeclarationFile,
      workflowTypesFile,
      functionTypesFile,
      typesDeclarationFile,
      packageMappings,
      schema,
    } = config
    const { workflows, workflowGraphs, functions: functionState } = visitState
    const { typesMap } = functionState

    // Get all workflow names (both DST and graph-based)
    const dstWorkflowNames = Object.keys(workflows.meta)
    const graphWorkflowNames = Object.keys(workflowGraphs.meta)
    const allWorkflowNames = [
      ...new Set([...dstWorkflowNames, ...graphWorkflowNames]),
    ]

    const hasWorkflows = allWorkflowNames.length > 0

    // Validate that workflowService is configured if workflows are defined
    if (hasWorkflows) {
      const hasWorkflowState =
        visitState.serviceAggregation.allSingletonServices.includes(
          'workflowService'
        )
      if (!hasWorkflowState) {
        logger.critical(
          ErrorCode.WORKFLOW_ORCHESTRATOR_NOT_CONFIGURED,
          'Workflows detected but workflowService service not configured. Please add workflowService to your singleton services'
        )
        throw new Error(
          'WorkflowState service not configured but workflows are defined'
        )
      }
    }

    // Generate unified JSON (convert DST to graph format and merge)
    if (hasWorkflows && workflowGraphsMetaJsonFile) {
      const dstAsGraphs = convertAllDstToGraphs(workflows.meta)
      const unifiedMeta = {
        ...dstAsGraphs,
        ...workflowGraphs.meta,
      }

      await writeFileInDir(
        logger,
        workflowGraphsMetaJsonFile,
        JSON.stringify(unifiedMeta, null, 2),
        { ignoreModifyComment: true }
      )
    }

    // Generate workflow registration (meta + DST workflow registrations)
    const jsonImportPath = getFileImportRelativePath(
      workflowsWiringFile,
      workflowGraphsMetaJsonFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      workflowsWiringFile,
      serializeWorkflowRegistration(
        workflowsWiringFile,
        jsonImportPath,
        allWorkflowNames,
        workflows.files,
        packageMappings,
        schema?.supportsImportAttributes ?? false,
        config.externalPackageName
      )
    )

    // Generate workflow types (DST + graph helpers in one file)
    const functionTypesImportPath = getFileImportRelativePath(
      workflowTypesFile,
      functionTypesFile,
      packageMappings
    )
    const rpcMapImportPath = getFileImportRelativePath(
      workflowTypesFile,
      config.rpcInternalMapDeclarationFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      workflowTypesFile,
      serializeWorkflowTypes(functionTypesImportPath, rpcMapImportPath)
    )

    // Generate workflow map (I/O types for type-safe client)
    // Always generate even if empty - RPC map imports WorkflowMap
    await writeFileInDir(
      logger,
      workflowMapDeclarationFile,
      serializeWorkflowMap(
        workflowMapDeclarationFile,
        packageMappings,
        typesMap,
        functionState.meta,
        workflows.meta
      )
    )

    // Generate workflow workers if configured
    if (config.workflows) {
      if (config.workflows.singleQueue) {
        const workflowPath = join(config.rootDir, config.workflows.path)
        const pathToPikkuTypes = getFileImportRelativePath(
          workflowPath,
          typesDeclarationFile,
          packageMappings
        )
        await writeFileInDir(
          logger,
          workflowPath,
          serializeWorkflowWorkers(pathToPikkuTypes)
        )
      } else if (workflows.files.size > 0) {
        logger.critical(
          ErrorCode.WORKFLOW_MULTI_QUEUE_NOT_SUPPORTED,
          'Multi-queue workflows are not supported when workflows.singleQueue is false. Please enable singleQueue in your configuration.'
        )
        return false
      }
    }

    return hasWorkflows
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Workflows',
      commandEnd: 'Generated Workflows',
    }),
  ],
})
