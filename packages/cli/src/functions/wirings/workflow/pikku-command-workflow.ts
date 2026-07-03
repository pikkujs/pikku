import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWorkflowTypes } from './serialize-workflow-types.js'
import { serializeUserFlowActors } from './serialize-user-flow-actors.js'
import { serializeWorkflowRegistration } from './serialize-workflow-registration.js'
import { serializeWorkflowMap } from './serialize-workflow-map.js'
import { serializeWorkflowBootstrapMap } from './serialize-workflow-bootstrap-map.js'
import { serializeWorkflowMeta } from './serialize-workflow-meta.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'
import { join, dirname } from 'path'

type WorkflowCommandInput = {
  bootstrap?: boolean
}

export const pikkuWorkflow = pikkuSessionlessFunc<
  WorkflowCommandInput,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }, input) => {
    const bootstrap = input?.bootstrap === true
    const visitState = bootstrap
      ? await getInspectorState(false, true, true)
      : await getInspectorState()
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

    const allWorkflowNames = [
      ...new Set([
        ...Object.keys(workflows.graphMeta),
        ...Object.keys(workflows.meta),
      ]),
    ]
    const hasRelevantWorkflows = allWorkflowNames.length > 0
    const hasWorkflows = hasRelevantWorkflows

    if (hasWorkflows) {
      const singletonServices =
        visitState.serviceAggregation.allSingletonServices.length > 0
          ? visitState.serviceAggregation.allSingletonServices
          : visitState.typesLookup?.get('SingletonServices')?.[0]
            ? visitState.typesLookup
                .get('SingletonServices')![0]
                .getProperties()
                .map((symbol) => symbol.getName())
            : []
      const hasWorkflowState = singletonServices.includes('workflowService')
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

    const userFlowActors = config.userFlows?.actors
    if (userFlowActors && Object.keys(userFlowActors).length > 0) {
      const agentMapImportPath = getFileImportRelativePath(
        config.userFlowActorsFile,
        config.agentMapDeclarationFile,
        packageMappings
      )
      await writeFileInDir(
        logger,
        config.userFlowActorsFile,
        serializeUserFlowActors(userFlowActors, agentMapImportPath)
      )
      // JSON twin for the runtime meta service (console personas view). Lives
      // next to workflow/meta but NOT inside it — getWorkflowMeta() treats
      // every workflow/meta/*.gen.json as a workflow.
      await writeFileInDir(
        logger,
        join(dirname(config.userFlowActorsFile), 'user-flow-actors.gen.json'),
        JSON.stringify(userFlowActors, null, 2)
      )
    }

    await writeFileInDir(
      logger,
      workflowMapDeclarationFile,
      bootstrap
        ? serializeWorkflowBootstrapMap(workflows.meta, workflows.graphMeta)
        : serializeWorkflowMap(
            logger,
            workflowMapDeclarationFile,
            packageMappings,
            typesMap,
            functionState.meta,
            workflows.meta,
            workflows.graphMeta,
            visitState.rpc?.wireAddonDeclarations
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
