import { pikkuSessionlessFunc } from '#pikku/function'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeVirtualUserFunctions } from './serialize-virtual-user-functions.js'
import { resolveScaffoldFeature } from '../../../utils/resolve-scaffold-feature.js'

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

    // A virtual user IS a persona — the generated functions sign in as one and
    // run as them. With none declared the scaffold would emit RPCs whose only
    // possible answer is "unknown persona". Fail the codegen instead of
    // shipping that.
    if (Object.keys(state.personas?.definitions ?? {}).length === 0) {
      throw new Error(
        `"scaffold.virtualUser" is enabled but no personas are declared.\n` +
          `A virtual user runs AS a persona, so there is nobody to run.\n` +
          `Fix: declare one with definePersonas({ ... }), or remove ` +
          `"scaffold.virtualUser" from pikku.config.json.`
      )
    }

    const leaf = (name: string) =>
      getLeafImportPath(config.virtualUserFunctionsFile!, name, config)
    const pathToPersonas = getFileImportRelativePath(
      config.virtualUserFunctionsFile,
      config.personasWiringFile,
      config.packageMappings
    )
    const { schemas, functions } = serializeVirtualUserFunctions(
      leaf,
      pathToPersonas,
      resolveScaffoldFeature('virtualUser', config.scaffold.virtualUser).auth
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
