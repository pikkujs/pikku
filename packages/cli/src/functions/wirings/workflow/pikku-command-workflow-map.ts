import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { serializeWorkflowMap } from './serialize-workflow-map.js'

export const pikkuWorkflowMap: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const { workflowMapDeclarationFile, packageMappings } = config
    const { workflows, functions: functionState } = visitState
    const { typesMap } = functionState

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
  },
})
