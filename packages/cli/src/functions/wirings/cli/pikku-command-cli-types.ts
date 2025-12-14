import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeCLITypes } from './serialize-cli-types.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'

export const pikkuCLITypes: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { cliTypesFile, functionTypesFile, packageMappings } = config
    const visitState = await getInspectorState()

    const functionTypesImportPath = getFileImportRelativePath(
      cliTypesFile,
      functionTypesFile,
      packageMappings
    )

    // Check for required types
    checkRequiredTypes(visitState.filesAndMethodsErrors, {
      userSessionType: true,
      wireServiceType: true,
      singletonServicesType: true,
    })

    const { userSessionType, singletonServicesType } =
      visitState.filesAndMethods

    if (!userSessionType || !singletonServicesType) {
      throw new Error('Required types not found')
    }

    const content = serializeCLITypes(
      functionTypesImportPath,
      `import type { ${userSessionType.type} } from '${getFileImportRelativePath(cliTypesFile, userSessionType.typePath, packageMappings)}'`,
      userSessionType.type,
      `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(cliTypesFile, singletonServicesType.typePath, packageMappings)}'`,
      singletonServicesType.type
    )
    await writeFileInDir(logger, cliTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating CLI types',
      commandEnd: 'Created CLI types',
    }),
  ],
})
