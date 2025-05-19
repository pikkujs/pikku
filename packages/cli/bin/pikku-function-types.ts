import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  getFileImportRelativePath,
  getPikkuFilesAndMethods,
  logCommandInfoAndTime,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils/utils.js'
import { serializePikkuTypes } from '../src/serialize-pikku-types.js'

export const pikkuFunctionTypes = async (
  { typesDeclarationFile: typesFile, packageMappings }: PikkuCLIConfig,
  options: PikkuCLIOptions,
  visitState: InspectorState
) => {
  await logCommandInfoAndTime(
    'Creating api types',
    'Created api types',
    [false],
    async () => {
      const { userSessionType, sessionServicesType, singletonServicesType } =
        await getPikkuFilesAndMethods(
          visitState,
          packageMappings,
          typesFile,
          options,
          {
            userSessionType: true,
            sessionServiceType: true,
            singletonServicesType: true,
          }
        )

      const content = serializePikkuTypes(
        `import type { ${userSessionType.type} } from '${getFileImportRelativePath(typesFile, userSessionType.typePath, packageMappings)}'`,
        userSessionType.type,
        `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(typesFile, singletonServicesType.typePath, packageMappings)}'`,
        singletonServicesType.type,
        `import type { ${sessionServicesType.type} } from '${getFileImportRelativePath(typesFile, sessionServicesType.typePath, packageMappings)}'`,
        sessionServicesType.type
      )
      await writeFileInDir(typesFile, content)
    }
  )
}
