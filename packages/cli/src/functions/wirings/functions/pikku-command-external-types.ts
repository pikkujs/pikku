import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeExternalTypes } from './serialize-external-types.js'

export const pikkuExternalTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      externalTypesFile,
      packageMappings,
      servicesFile,
      secretsFile,
      variablesFile,
    } = config

    checkRequiredTypes(visitState.filesAndMethodsErrors, {
      singletonServicesType: true,
    })

    const { singletonServicesType, pikkuConfigType } =
      visitState.filesAndMethods

    if (!singletonServicesType) {
      throw new Error('Required types not found')
    }

    const configTypeImport = pikkuConfigType
      ? `import type { ${pikkuConfigType.type} } from '${getFileImportRelativePath(externalTypesFile, pikkuConfigType.typePath, packageMappings)}'`
      : '// Config type not found, will use fallback'

    const content = serializeExternalTypes(
      `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(externalTypesFile, singletonServicesType.typePath, packageMappings)}'`,
      singletonServicesType.type,
      configTypeImport,
      `import type { RequiredSingletonServices } from '${getFileImportRelativePath(externalTypesFile, servicesFile, packageMappings)}'`,
      `import { TypedSecretService } from '${getFileImportRelativePath(externalTypesFile, secretsFile, packageMappings)}'`,
      `import { TypedVariablesService } from '${getFileImportRelativePath(externalTypesFile, variablesFile, packageMappings)}'`
    )

    await writeFileInDir(logger, externalTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating external types',
      commandEnd: 'Created external types',
    }),
  ],
})
