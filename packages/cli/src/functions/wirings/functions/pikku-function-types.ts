import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePikkuTypesHub } from './serialize-pikku-types-hub.js'

export const pikkuFunctionTypes: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const {
      typesDeclarationFile: typesFile,
      packageMappings,
      functionTypesFile,
      httpTypesFile,
      channelsTypesFile,
      schedulersTypesFile,
      queueTypesFile,
      mcpTypesFile,
      cliTypesFile,
      forgeTypesFile,
    } = config

    const content = serializePikkuTypesHub(
      getFileImportRelativePath(typesFile, functionTypesFile, packageMappings),
      getFileImportRelativePath(typesFile, httpTypesFile, packageMappings),
      getFileImportRelativePath(typesFile, channelsTypesFile, packageMappings),
      getFileImportRelativePath(
        typesFile,
        schedulersTypesFile,
        packageMappings
      ),
      getFileImportRelativePath(typesFile, queueTypesFile, packageMappings),
      getFileImportRelativePath(typesFile, mcpTypesFile, packageMappings),
      getFileImportRelativePath(typesFile, cliTypesFile, packageMappings),
      getFileImportRelativePath(typesFile, forgeTypesFile, packageMappings)
    )

    await writeFileInDir(logger, typesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating api types hub',
      commandEnd: 'Created api types hub',
    }),
  ],
})
