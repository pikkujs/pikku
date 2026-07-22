import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeUserAdminFunctions } from './serialize-user-admin-functions.js'

export const pikkuUserAdminFunctions = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    if (!config.scaffold?.userAdmin || !config.userAdminFunctionsFile) {
      logger.debug({
        message:
          'Skipping user admin scaffold (set scaffold.userAdmin in pikku.config.json to enable).',
        type: 'skip',
      })
      return false
    }

    const { definition } = (await getInspectorState()).auth

    // These functions are thin wrappers over better-auth's admin() endpoints.
    // Without that plugin the endpoints do not exist, so the scaffold would
    // generate four RPCs that throw on every call and four scopes that grant
    // nothing. Fail the codegen instead of shipping that.
    if (!definition) {
      throw new Error(
        `"scaffold.userAdmin" is enabled but no pikkuBetterAuth(...) was found in the project.\n` +
          `User management wraps better-auth's admin() endpoints, so there is nothing to wrap.\n` +
          `Fix: set up Better Auth before scaffolding user management, or remove ` +
          `"scaffold.userAdmin" from pikku.config.json.`
      )
    }
    if (!definition.plugins.includes('admin')) {
      throw new Error(
        `"scaffold.userAdmin" is enabled but better-auth is configured without the admin() plugin.\n` +
          `Ban, delete, session-revocation and set-password are implemented by that plugin — without it ` +
          `the generated functions would fail on every call.\n` +
          `Fix: add admin() to the plugins array in ${definition.sourceFile}:\n` +
          `  import { admin } from 'better-auth/plugins'\n` +
          `  betterAuth({ plugins: [admin()] })\n` +
          `Then re-run codegen. Or remove "scaffold.userAdmin" from pikku.config.json.`
      )
    }

    const pathToPikkuTypes = getFileImportRelativePath(
      config.userAdminFunctionsFile,
      config.typesDeclarationFile,
      config.packageMappings
    )
    await writeFileInDir(
      logger,
      config.userAdminFunctionsFile,
      serializeUserAdminFunctions(
        pathToPikkuTypes,
        config.scaffold.userAdmin === 'auth'
      )
    )
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating user management functions',
      commandEnd: 'Generated user management functions',
    }),
  ],
})
