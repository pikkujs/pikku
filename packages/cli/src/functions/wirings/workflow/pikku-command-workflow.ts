import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { ErrorCode } from '@pikku/inspector'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeWorkflowMeta,
  serializeWorkflowMetaTS,
} from './serialize-workflow-meta.js'
import { serializeWorkflowTypes } from './serialize-workflow-types.js'
import { serializeWorkflowMap } from './serialize-workflow-map.js'
import { serializeWorkflowWorkers } from './serialize-workflow-workers.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
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
      workflowsWiringMetaJsonFile,
      workflowMapDeclarationFile,
      workflowTypesFile,
      functionTypesFile,
      typesDeclarationFile,
      packageMappings,
      schema,
      rpcInternalMapDeclarationFile,
    } = config
    const { workflows, functions: functionState } = visitState
    const { typesMap } = functionState

    // Check for required types
    checkRequiredTypes(visitState.filesAndMethodsErrors, {
      userSessionType: true,
      sessionServiceType: true,
      singletonServicesType: true,
      singletonServicesFactory: false,
      sessionServicesFactory: false,
    })

    const { userSessionType, singletonServicesType } =
      visitState.filesAndMethods

    if (!userSessionType || !singletonServicesType) {
      throw new Error('Required types not found')
    }

    // Validate that workflowService service is configured if workflows are defined
    const hasWorkflows = Object.keys(workflows.meta).length > 0
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

    await writeFileInDir(
      logger,
      workflowsWiringMetaJsonFile,
      JSON.stringify(serializeWorkflowMeta(workflows.meta), null, 2)
    )

    const jsonImportPath = getFileImportRelativePath(
      workflowsWiringMetaFile,
      workflowsWiringMetaJsonFile,
      packageMappings
    )

    // Write workflow metadata TypeScript file that imports JSON
    await writeFileInDir(
      logger,
      workflowsWiringMetaFile,
      serializeWorkflowMetaTS(
        workflows.meta,
        jsonImportPath,
        schema?.supportsImportAttributes ?? false
      )
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

    const userSessionImportPath = getFileImportRelativePath(
      workflowTypesFile,
      userSessionType.typePath,
      packageMappings
    )

    const singletonServicesImportPath = getFileImportRelativePath(
      workflowTypesFile,
      singletonServicesType.typePath,
      packageMappings
    )

    const rpcMapImportPath = getFileImportRelativePath(
      workflowTypesFile,
      rpcInternalMapDeclarationFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      workflowTypesFile,
      serializeWorkflowTypes(
        functionTypesImportPath,
        userSessionImportPath,
        userSessionType.type,
        singletonServicesImportPath,
        singletonServicesType.type,
        rpcMapImportPath
      )
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

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding Workflows',
      commandEnd: 'Found Workflows',
    }),
  ],
})
