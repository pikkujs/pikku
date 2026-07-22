import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { projectDeclaresBetterAuth } from '../../../utils/detect-better-auth.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeConsoleFunctions } from './serialize-console-functions.js'

export const pikkuConsoleFunctions = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    const deployCodegenFlag = await variables.get('PIKKU_DEPLOY_CODEGEN')
    if (deployCodegenFlag === '1') {
      return false
    }

    if (config.scaffold?.console && config.consoleSchemasFile) {
      // Every console RPC now requires an authenticated session (the console is
      // an admin surface), so scaffolding it without an auth strategy produces a
      // console that 403s on every call. Better Auth is the supported strategy —
      // fail fast rather than ship a dead console.
      const hasBetterAuth = await projectDeclaresBetterAuth(
        config.rootDir,
        config.srcDirectories,
        config.ignoreFiles
      )
      if (!hasBetterAuth) {
        throw new Error(
          `"scaffold.console" is enabled but no pikkuBetterAuth(...) was found in the project.\n` +
            `The console addon requires an authenticated session on every RPC — a console without auth ` +
            `returns 403 on every call.\n` +
            `Fix: set up Better Auth (add a pikkuBetterAuth(...) config) before scaffolding the console, ` +
            `or remove "scaffold.console" from pikku.config.json.`
        )
      }

      const pathToPikkuTypes = getFileImportRelativePath(
        config.consoleFunctionsFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      const pathToAgentTypes = getFileImportRelativePath(
        config.consoleFunctionsFile,
        config.agentTypesFile,
        config.packageMappings
      )
      const { schemas, functions } = serializeConsoleFunctions(
        pathToPikkuTypes,
        pathToAgentTypes,
        config.globalHTTPPrefix || ''
      )
      await writeFileInDir(logger, config.consoleSchemasFile, schemas)
      await writeFileInDir(logger, config.consoleFunctionsFile, functions)
      await removeLegacyScaffoldFile(config.consoleFunctionsFile)
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Console functions',
      commandEnd: 'Generated Console functions',
    }),
  ],
})
