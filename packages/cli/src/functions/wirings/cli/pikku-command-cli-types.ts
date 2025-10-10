import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeCLITypes } from './serialize-cli-types.js'
import { getPikkuFilesAndMethods } from '../../../utils/pikku-files-and-methods.js'

export const pikkuCLITypes: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { cliTypesFile, functionTypesFile, packageMappings } = config
    const visitState = await getInspectorState()

    const functionTypesImportPath = getFileImportRelativePath(
      cliTypesFile,
      functionTypesFile,
      packageMappings
    )

    // Get type information for SingletonServices and Session
    const { userSessionType, singletonServicesType } =
      await getPikkuFilesAndMethods(
        logger,
        visitState,
        packageMappings,
        cliTypesFile,
        {},
        {
          userSessionType: true,
          sessionServiceType: true,
          singletonServicesType: true,
        }
      )

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
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
