import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePikkuTypesHub } from './serialize-pikku-types-hub.js'

export const pikkuFunctionTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const {
      typesDeclarationFile: typesFile,
      packageMappings,
      functionTypesFile,
      httpTypesFile,
      channelsTypesFile,
      triggersTypesFile,
      schedulersTypesFile,
      queueTypesFile,
      mcpTypesFile,
      cliTypesFile,
      forgeTypesFile,
      secretTypesFile,
      externalTypesFile,
    } = config

    const getImportPath = (file: string) =>
      config.externalPackage
        ? null
        : getFileImportRelativePath(typesFile, file, packageMappings)

    // Forge and trigger types are included for external packages
    const getAlwaysImportPath = (file: string) =>
      getFileImportRelativePath(typesFile, file, packageMappings)

    const content = serializePikkuTypesHub(
      getFileImportRelativePath(typesFile, functionTypesFile, packageMappings),
      getImportPath(httpTypesFile),
      getImportPath(channelsTypesFile),
      getAlwaysImportPath(triggersTypesFile),
      getImportPath(schedulersTypesFile),
      getImportPath(queueTypesFile),
      getImportPath(mcpTypesFile),
      getImportPath(cliTypesFile),
      getAlwaysImportPath(forgeTypesFile),
      getAlwaysImportPath(secretTypesFile),
      config.externalPackage ? getAlwaysImportPath(externalTypesFile) : null
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
