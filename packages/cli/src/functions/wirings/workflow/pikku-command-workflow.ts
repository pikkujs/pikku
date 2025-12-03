import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { convertDslToGraph, ErrorCode } from '@pikku/inspector'
import type { WorkflowsMeta } from '@pikku/core/workflow'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWorkflowTypes } from './serialize-workflow-types.js'
import { serializeWorkflowRegistration } from './serialize-workflow-registration.js'
import { serializeWorkflowMap } from './serialize-workflow-map.js'
import { serializeWorkflowMeta } from './serialize-workflow-meta.js'
import { serializeWorkflowWorkers } from './serialize-workflow-workers.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'
import { join } from 'path'

export const pikkuWorkflow: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      workflowsWiringFile,
      workflowsWiringMetaFile,
      workflowMetaDir,
      workflowMapDeclarationFile,
      workflowTypesFile,
      functionTypesFile,
      typesDeclarationFile,
      packageMappings,
      schema,
    } = config
    const { workflows, functions: functionState } = visitState
    const { typesMap } = functionState

    // Get all workflow names (both DSL and graph-based)
    const dslWorkflowNames = Object.keys(workflows.meta)
    const graphWorkflowNames = Object.keys(workflows.graphMeta)
    const allWorkflowNames = [
      ...new Set([...dslWorkflowNames, ...graphWorkflowNames]),
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

    // Generate individual JSON files for each workflow (convert DSL to graph format)
    if (hasWorkflows && workflowMetaDir) {
      // Write individual JSON files for DSL workflows
      const dslMeta = workflows.meta as WorkflowsMeta
      for (const [name, meta] of Object.entries(dslMeta)) {
        const graphMeta = convertDslToGraph(name, meta)

        // Write minimal version (runtime-only fields)
        const minimalMeta = stripVerboseFields(graphMeta)
        const minimalPath = join(workflowMetaDir, `${name}.gen.json`)
        await writeFileInDir(
          logger,
          minimalPath,
          JSON.stringify(minimalMeta, null, 2),
          { ignoreModifyComment: true }
        )

        // Write verbose version only if it has additional fields
        if (hasVerboseFields(graphMeta)) {
          const verbosePath = join(workflowMetaDir, `${name}-verbose.gen.json`)
          await writeFileInDir(
            logger,
            verbosePath,
            JSON.stringify(graphMeta, null, 2),
            { ignoreModifyComment: true }
          )
        }
      }

      // Write individual JSON files for graph workflows
      for (const [name, graphMeta] of Object.entries(workflows.graphMeta)) {
        // Write minimal version (runtime-only fields)
        const minimalMeta = stripVerboseFields(graphMeta)
        const minimalPath = join(workflowMetaDir, `${name}.gen.json`)
        await writeFileInDir(
          logger,
          minimalPath,
          JSON.stringify(minimalMeta, null, 2),
          { ignoreModifyComment: true }
        )

        // Write verbose version only if it has additional fields
        if (hasVerboseFields(graphMeta)) {
          const verbosePath = join(workflowMetaDir, `${name}-verbose.gen.json`)
          await writeFileInDir(
            logger,
            verbosePath,
            JSON.stringify(graphMeta, null, 2),
            { ignoreModifyComment: true }
          )
        }
      }
    }

    // Generate workflow meta aggregation file
    if (workflowsWiringMetaFile && workflowMetaDir) {
      await writeFileInDir(
        logger,
        workflowsWiringMetaFile,
        serializeWorkflowMeta(
          workflowsWiringMetaFile,
          workflowMetaDir,
          allWorkflowNames,
          packageMappings,
          schema?.supportsImportAttributes ?? false,
          config.externalPackageName
        )
      )
    }

    // Generate workflow registration (meta + DSL workflow registrations)
    const metaImportPath = getFileImportRelativePath(
      workflowsWiringFile,
      workflowsWiringMetaFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      workflowsWiringFile,
      serializeWorkflowRegistration(
        workflowsWiringFile,
        metaImportPath,
        allWorkflowNames,
        workflows.files,
        workflows.graphFiles,
        packageMappings,
        config.externalPackageName
      )
    )

    // Generate workflow types (DSL + graph helpers in one file)
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
