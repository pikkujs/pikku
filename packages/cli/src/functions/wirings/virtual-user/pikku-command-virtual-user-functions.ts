import { pikkuSessionlessFunc } from '#pikku/function'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeVirtualUserFunctions } from './serialize-virtual-user-functions.js'

export const pikkuVirtualUserFunctions = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    if (
      !config.scaffold?.virtualUser ||
      !config.virtualUserFunctionsFile ||
      !config.virtualUserSchemasFile
    ) {
      logger.debug({
        message:
          'Skipping virtual user scaffold (set scaffold.virtualUser in pikku.config.json to enable).',
        type: 'skip',
      })
      return false
    }

    const state = await getInspectorState()

    // The generated functions sign in as a declared virtual user and run as them. With none declared the scaffold would emit RPCs whose only
    // possible answer is "unknown virtual user". Fail the codegen instead of
    // shipping that.
    if (Object.keys(state.virtualUsers?.definitions ?? {}).length === 0) {
      throw new Error(
        `"scaffold.virtualUser" is enabled but no virtual users are declared.\n` +
          `A run needs a declared virtual user to sign in as, so there is nobody to run.\n` +
          `Fix: declare one with defineVirtualUsers({ ... }), or remove ` +
          `"scaffold.virtualUser" from pikku.config.json.`
      )
    }

    const leaf = (name: string) =>
      getLeafImportPath(config.virtualUserFunctionsFile!, name, config)
    const pathToVirtualUsers = getFileImportRelativePath(
      config.virtualUserFunctionsFile,
      config.virtualUsersWiringFile,
      config.packageMappings
    )
    const { schemas, functions } = serializeVirtualUserFunctions(
      leaf,
      pathToVirtualUsers,
      { betterAuth: Boolean(state.auth?.definition) }
    )
    await writeFileInDir(logger, config.virtualUserSchemasFile, schemas)
    await writeFileInDir(logger, config.virtualUserFunctionsFile, functions)
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating virtual user functions',
      commandEnd: 'Generated virtual user functions',
    }),
  ],
})
