import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWorkflowMeta } from './serialize-workflow-meta.js'
import { serializeWorkflowTypes } from './serialize-workflow-types.js'
import { serializeWorkflowMap } from './serialize-workflow-map.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuWorkflow: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      workflowsWiringFile,
      workflowsWiringMetaFile,
      workflowMapDeclarationFile,
      workflowTypesFile,
      functionTypesFile,
      packageMappings,
    } = config
    const { workflows, function: functionState, typesMap } = visitState

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

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding Workflows',
      commandEnd: 'Found Workflows',
    }),
  ],
})
