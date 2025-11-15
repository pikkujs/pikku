import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { serializeWorkflowTypes } from './serialize-workflow-types.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'

export const pikkuWorkflowTypes: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      workflowTypesFile,
      functionTypesFile,
      packageMappings,
      rpcInternalMapDeclarationFile,
    } = config

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
  },
})
