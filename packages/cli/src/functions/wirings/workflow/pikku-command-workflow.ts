import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWorkflowTypes } from './serialize-workflow-types.js'
import { serializeWorkflowRegistration } from './serialize-workflow-registration.js'
import { serializeWorkflowMap } from './serialize-workflow-map.js'
import { serializeWorkflowMeta } from './serialize-workflow-meta.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'
import { join } from 'path'

export const pikkuWorkflow = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      workflowsWiringFile,
      workflowsWiringMetaFile,
      workflowMetaDir,
      workflowMapDeclarationFile,
      workflowTypesFile,
      functionTypesFile,
      packageMappings,
      schema,
    } = config
    const { workflows, functions: functionState } = visitState
    const { typesMap } = functionState

    const allWorkflowNames = Object.keys(workflows.graphMeta)
    // Check if any of the filtered functions are actually workflow functions
    const workflowFuncIds = new Set(
      allWorkflowNames
        .map((name) => {
          const meta = workflows.meta[name]
          return meta?.pikkuFuncId
        })
        .filter(Boolean)
    )
    const hasRelevantWorkflows =
      allWorkflowNames.length > 0 &&
      Object.keys(functionState.meta).some((funcId) =>
        workflowFuncIds.has(funcId)
      )
    const hasWorkflows = hasRelevantWorkflows

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

    if (hasWorkflows && workflowMetaDir) {
      for (const [name, graphMeta] of Object.entries(workflows.graphMeta)) {
        const minimalMeta = stripVerboseFields(graphMeta)
        const minimalPath = join(workflowMetaDir, `${name}.gen.json`)
        await writeFileInDir(
          logger,
          minimalPath,
          JSON.stringify(minimalMeta, null, 2),
          { ignoreModifyComment: true }
        )

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
          config.addonName
        )
      )
    }

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
        config.addonName
      )
    )

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
    const workflowMapImportPath = getFileImportRelativePath(
      workflowTypesFile,
      workflowMapDeclarationFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      workflowTypesFile,
      serializeWorkflowTypes(
        functionTypesImportPath,
        rpcMapImportPath,
        workflowMapImportPath
      )
    )

    await writeFileInDir(
      logger,
      workflowMapDeclarationFile,
      serializeWorkflowMap(
        logger,
        workflowMapDeclarationFile,
        packageMappings,
        typesMap,
        functionState.meta,
        workflows.meta,
        workflows.graphMeta
      )
    )

    return hasWorkflows
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Workflows',
      commandEnd: 'Generated Workflows',
    }),
  ],
})
