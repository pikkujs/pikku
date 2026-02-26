import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeAddonTypes } from './serialize-addon-types.js'

export const pikkuAddonTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    if (!config.addon) {
      return
    }

    const visitState = await getInspectorState()
    const {
      addonTypesFile,
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
      ? `import type { ${pikkuConfigType.type} } from '${getFileImportRelativePath(addonTypesFile, pikkuConfigType.typePath, packageMappings)}'`
      : '// Config type not found, will use fallback'

    const content = serializeAddonTypes(
      `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(addonTypesFile, singletonServicesType.typePath, packageMappings)}'`,
      singletonServicesType.type,
      configTypeImport,
      `import type { RequiredSingletonServices } from '${getFileImportRelativePath(addonTypesFile, servicesFile, packageMappings)}'`,
      `import { TypedSecretService } from '${getFileImportRelativePath(addonTypesFile, secretsFile, packageMappings)}'`,
      `import { TypedVariablesService } from '${getFileImportRelativePath(addonTypesFile, variablesFile, packageMappings)}'`
    )

    await writeFileInDir(logger, addonTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating addon types',
      commandEnd: 'Created addon types',
    }),
  ],
})
