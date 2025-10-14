import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeFunctionTypes } from './serialize-function-types.js'

export const pikkuFunctionTypesSplit: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      functionTypesFile,
      packageMappings,
      rpcInternalMapDeclarationFile,
    } = config

    // Check for required types
    checkRequiredTypes(visitState.filesAndMethodsErrors, {
      userSessionType: true,
      sessionServiceType: true,
      singletonServicesType: true,
    })

    const { userSessionType, sessionServicesType, singletonServicesType } =
      visitState.filesAndMethods

    if (!userSessionType || !sessionServicesType || !singletonServicesType) {
      throw new Error('Required types not found')
    }

    const content = serializeFunctionTypes(
      `import type { ${userSessionType.type} } from '${getFileImportRelativePath(functionTypesFile, userSessionType.typePath, packageMappings)}'`,
      userSessionType.type,
      `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(functionTypesFile, singletonServicesType.typePath, packageMappings)}'`,
      singletonServicesType.type,
      `import type { ${sessionServicesType.type} } from '${getFileImportRelativePath(functionTypesFile, sessionServicesType.typePath, packageMappings)}'`,
      sessionServicesType.type,
      `import type { TypedPikkuRPC } from '${getFileImportRelativePath(functionTypesFile, rpcInternalMapDeclarationFile, packageMappings)}'`
    )

    await writeFileInDir(logger, functionTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating function types',
      commandEnd: 'Created function types',
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
