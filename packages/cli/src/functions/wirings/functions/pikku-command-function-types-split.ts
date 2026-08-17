import { pikkuSessionlessFunc } from '#pikku/function'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeFunctionTypes } from './serialize-function-types.js'
import { serializeAddonRefs } from './serialize-addon-refs.js'
import { serializeMiddlewareTypes } from '../middleware/serialize-middleware-types.js'
import { serializeSetupTypes } from '../setup/serialize-setup-types.js'
import { serializeAuthGuards } from '../auth/serialize-auth-guards.js'

export const pikkuFunctionTypesSplit = pikkuSessionlessFunc<
  { bootstrap?: boolean },
  void
>({
  func: async ({ logger, config, getInspectorState }, data) => {
    const visitState = await getInspectorState(
      false,
      true,
      data?.bootstrap ?? false
    )
    const {
      functionTypesFile,
      middlewareTypesFile,
      setupTypesFile,
      authGuardsFile,
      packageMappings,
      rpcInternalMapDeclarationFile,
      servicesFile,
      credentialsFile,
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

    // The credentials leaf is only written when the project declares at least
    // one credential, so importing from it unconditionally would emit a broken
    // import for every project that declares none.
    const credentialsTypeImport =
      credentialsFile && visitState.credentials?.definitions.length
        ? `import type { CredentialsMap } from '${getFileImportRelativePath(functionTypesFile, credentialsFile, packageMappings)}'`
        : undefined

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
      `import type { RequiredSingletonServices } from '${getFileImportRelativePath(functionTypesFile, servicesFile, packageMappings)}'`,
      configTypeImport,
      getFileImportRelativePath(
        functionTypesFile,
        authGuardsFile,
        packageMappings
      ),
      undefined,
      typeof config.addon === 'object' ? config.addon?.categories : undefined,
      `import type { ScopeId } from '${getFileImportRelativePath(functionTypesFile, config.scopesFile, packageMappings)}'`,
      credentialsTypeImport,
      getFileImportRelativePath(
        functionTypesFile,
        middlewareTypesFile,
        packageMappings
      ),
      { addon: !!config.addon }
    )

    await writeFileInDir(
      logger,
      middlewareTypesFile,
      serializeMiddlewareTypes(
        getFileImportRelativePath(
          middlewareTypesFile,
          functionTypesFile,
          packageMappings
        ),
        config.addonName
      )
    )

    await writeFileInDir(
      logger,
      setupTypesFile,
      serializeSetupTypes(
        getFileImportRelativePath(
          setupTypesFile,
          functionTypesFile,
          packageMappings
        ),
        pikkuConfigType
          ? `import type { ${pikkuConfigType.type} } from '${getFileImportRelativePath(setupTypesFile, pikkuConfigType.typePath, packageMappings)}'`
          : '// Config type not found, will use fallback',
        pikkuConfigType?.type,
        `import type { RequiredSingletonServices, RequiredWireServices } from '${getFileImportRelativePath(setupTypesFile, servicesFile, packageMappings)}'`
      )
    )

    await writeFileInDir(
      logger,
      authGuardsFile,
      serializeAuthGuards(
        getFileImportRelativePath(
          authGuardsFile,
          functionTypesFile,
          packageMappings
        ),
        config.addonName
      )
    )

    const addonRefs = serializeAddonRefs({
      addonHttp: visitState.exportedContracts.addonHttp,
      addonChannel: visitState.exportedContracts.addonChannel,
      addonCli: visitState.exportedContracts.addonCli,
    })

    await writeFileInDir(logger, functionTypesFile, `${content}\n${addonRefs}`)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating function types',
      commandEnd: 'Created function types',
    }),
  ],
})
