import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeUserAdminFunctions } from './serialize-user-admin-functions.js'

export const pikkuUserAdminFunctions = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    if (
      !config.scaffold?.userAdmin ||
      !config.userAdminFunctionsFile ||
      !config.userAdminSchemasFile
    ) {
      logger.debug({
        message:
          'Skipping user admin scaffold (set scaffold.userAdmin in pikku.config.json to enable).',
        type: 'skip',
      })
      return false
    }

    const { definition } = (await getInspectorState()).auth

    // Every one of these functions drives better-auth's internal adapter, so
    // without a better-auth instance the scaffold would generate RPCs that
    // throw on every call and scopes that grant nothing. Fail the codegen
    // instead of shipping that.
    if (!definition) {
      throw new Error(
        `"scaffold.userAdmin" is enabled but no pikkuBetterAuth(...) was found in the project.\n` +
          `User management works through better-auth's internal adapter, so there is nothing to manage.\n` +
          `Fix: set up Better Auth before scaffolding user management, or remove ` +
          `"scaffold.userAdmin" from pikku.config.json.`
      )
    }
    // Ban is the one capability with a schema requirement of its own, and it is
    // only one of the six — a warning rather than a failure, so an app that
    // never bans anyone is not forced to carry the columns.
    // The plugin ids here are the callee names read off the `plugins: [...]`
    // array, so both the current `pikkuBan()` and the deprecated `ban()` alias
    // have to count as wired.
    const bansUsers =
      definition.plugins.includes('pikkuBan') ||
      definition.plugins.includes('ban')
    if (!bansUsers) {
      logger.warn(
        `"scaffold.userAdmin" is enabled but better-auth is configured without the pikkuBan() plugin, ` +
          `so the banned/banReason/banExpires columns do not exist and setUserBanned will fail.\n` +
          `Fix: add pikkuBan() to the plugins array in ${definition.sourceFile}:\n` +
          `  import { pikkuBan } from '@pikku/better-auth'\n` +
          `  betterAuth({ plugins: [pikkuBan()] })`
      )
    }

    const leaf = (name: string) =>
      getLeafImportPath(config.userAdminFunctionsFile!, name, config)
    const { schemas, functions } = serializeUserAdminFunctions(leaf)
    await writeFileInDir(logger, config.userAdminSchemasFile, schemas)
    await writeFileInDir(logger, config.userAdminFunctionsFile, functions)
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating user management functions',
      commandEnd: 'Generated user management functions',
    }),
  ],
})
