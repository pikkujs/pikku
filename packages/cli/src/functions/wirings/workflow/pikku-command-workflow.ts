import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { ErrorCode } from '@pikku/inspector'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWorkflowMeta } from './serialize-workflow-meta.js'
import { serializeWorkflowTypes } from './serialize-workflow-types.js'
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
      workflowsWiringMetaFile,
      workflowWorkersDirectory,
      workflowMapDeclarationFile,
      workflowTypesFile,
      functionTypesFile,
      packageMappings,
    } = config
    const { workflows, functions: functionState } = visitState
    const { typesMap } = functionState

    // Validate that workflowState service is configured if workflows are defined
    const hasWorkflows = Object.keys(workflows.meta).length > 0
    if (hasWorkflows) {
      const hasWorkflowState =
        visitState.serviceAggregation.allSingletonServices.includes(
          'workflowState'
        )
      if (!hasWorkflowState) {
        logger.critical(
          ErrorCode.WORKFLOW_STATE_NOT_CONFIGURED,
          'Workflows detected but workflowState service not configured. Please add workflowState to your singleton services:\n\n' +
            "import { WorkflowStateService } from '@pikku/core/workflow'\n\n" +
            'export const createSingletonServices = async (config) => {\n' +
            "  const workflowState = new WorkflowStateService('.workflows')\n" +
            '  return {\n' +
            '    ...,\n' +
            '    workflowState,\n' +
            '  }\n' +
            '}'
        )
        throw new Error(
          'WorkflowState service not configured but workflows are defined'
        )
      }
    }

    // Write workflow metadata
    await writeFileInDir(
      logger,
      workflowsWiringMetaFile,
      serializeWorkflowMeta(workflows.meta)
    )

    // Write workflow wirings (imports)
    await writeFileInDir(
      logger,
      workflowsWiringFile,
      serializeFileImports(
        'wireWorkflow',
        workflowsWiringFile,
        workflows.files,
        packageMappings
      )
    )

    // Write workflow types
    const functionTypesImportPath = getFileImportRelativePath(
      workflowTypesFile,
      functionTypesFile,
      packageMappings
    )
    await writeFileInDir(
      logger,
      workflowTypesFile,
      serializeWorkflowTypes(functionTypesImportPath)
    )

    // Write workflow map (type-safe client API)
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

    // Write workflow workers (queue workers for RPC steps and orchestrators)
    // Workers are written to the workflowWorkersDirectory so they're scanned by inspector
    const workflowsWorkersFile = join(
      workflowWorkersDirectory!,
      'workflow.workers.gen.ts'
    )
    await writeFileInDir(
      logger,
      workflowsWorkersFile,
      serializeWorkflowWorkers(workflows.meta)
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding Workflows',
      commandEnd: 'Found Workflows',
    }),
  ],
})
