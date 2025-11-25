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
      servicesFile,
    } = config

    // Check for required types
    checkRequiredTypes(visitState.filesAndMethodsErrors, {
      userSessionType: true,
      wireServiceType: true,
      singletonServicesType: true,
    })

    const {
      userSessionType,
      wireServicesType,
      singletonServicesType,
      pikkuConfigType,
    } = visitState.filesAndMethods

    if (!userSessionType || !wireServicesType || !singletonServicesType) {
      throw new Error('Required types not found')
    }

    const configTypeImport = pikkuConfigType
      ? `import type { ${pikkuConfigType.type} } from '${getFileImportRelativePath(functionTypesFile, pikkuConfigType.typePath, packageMappings)}'`
      : '// Config type not found, will use fallback'

    const content = serializeFunctionTypes(
      `import type { ${userSessionType.type} } from '${getFileImportRelativePath(functionTypesFile, userSessionType.typePath, packageMappings)}'`,
      userSessionType.type,
      `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(functionTypesFile, singletonServicesType.typePath, packageMappings)}'`,
      singletonServicesType.type,
      `import type { ${wireServicesType.type} } from '${getFileImportRelativePath(functionTypesFile, wireServicesType.typePath, packageMappings)}'`,
      wireServicesType.type,
      `import type { TypedPikkuRPC, FlattenedRPCMap } from '${getFileImportRelativePath(functionTypesFile, rpcInternalMapDeclarationFile, packageMappings)}'`,
      `import type { RequiredSingletonServices, RequiredWireServices } from '${getFileImportRelativePath(functionTypesFile, servicesFile, packageMappings)}'`,
      configTypeImport,
      config.externalPackageName
    )

    await writeFileInDir(logger, functionTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating function types',
      commandEnd: 'Created function types',
    }),
  ],
})
