import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { generateWorkflowTypes } from './utils/generate-workflow-types.js'

export const pikkuWorkflowTypes: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      workflowTypesFile,
      functionTypesFile,
      packageMappings,
      rpcInternalMapDeclarationFile,
    } = config

    const workflowTypes = generateWorkflowTypes(visitState, {
      workflowTypesFile,
      functionTypesFile,
      rpcInternalMapDeclarationFile,
      packageMappings,
    })

    await writeFileInDir(logger, workflowTypesFile, workflowTypes)
  },
})
