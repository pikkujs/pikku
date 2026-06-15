import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePikkuTypesHub } from './serialize-pikku-types-hub.js'

export const pikkuFunctionTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
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
      nodeTypesFile,
      secretTypesFile,
      addonTypesFile,
      authTypesFile,
    } = config

    const getImportPath = (file: string) =>
      config.addon
        ? null
        : getFileImportRelativePath(typesFile, file, packageMappings)

    // Node and trigger types are included for addon packages
    const getAlwaysImportPath = (file: string) =>
      getFileImportRelativePath(typesFile, file, packageMappings)

    // Include the typed defineAuth re-export only when the project has a
    // defineAuth declaration. This avoids importing @pikku/better-auth in
    // projects that don't use it.
    const state = await getInspectorState()
    const authTypesImportPath =
      authTypesFile && state.auth.definition
        ? getFileImportRelativePath(typesFile, authTypesFile, packageMappings)
        : null

    const content = serializePikkuTypesHub(
      getFileImportRelativePath(typesFile, functionTypesFile, packageMappings),
      getImportPath(httpTypesFile),
      getImportPath(channelsTypesFile),
      getAlwaysImportPath(triggersTypesFile),
      getImportPath(schedulersTypesFile),
      getImportPath(queueTypesFile),
      getImportPath(mcpTypesFile),
      getImportPath(cliTypesFile),
      getAlwaysImportPath(nodeTypesFile),
      getAlwaysImportPath(secretTypesFile),
      config.addon ? getAlwaysImportPath(addonTypesFile) : null,
      authTypesImportPath
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
