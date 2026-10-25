import { pikkuSessionlessFunc } from '#pikku/function'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeRPCWrapper } from './serialize-rpc-wrapper.js'
import {
  serializeAuthClient,
  serializeEnv,
  serializeRpc,
  serializeTypes,
} from './serialize-client-support.js'

/** The RPC the generated auth glue asks for the signed-in session. */
const SESSION_RPC = 'getSession'

export const pikkuRPCClient = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const rpcWiringsFile = config.clientFiles?.rpcWiringsFile
    const { rpcMapDeclarationFile, packageMappings } = config

    // If rpcWiringsFile is not set, clean up any existing file and return
    if (!rpcWiringsFile) {
      logger.debug({
        message:
          "Skipping generating RPC wrappers since rpcWiringsFile isn't set in the pikku config.",
        type: 'skip',
      })
      return
    }

    const rpcMapDeclarationPath = getFileImportRelativePath(
      rpcWiringsFile,
      rpcMapDeclarationFile,
      packageMappings
    )
    const content = [
      serializeRPCWrapper(rpcMapDeclarationPath, config.globalHTTPPrefix || ''),
    ]
    await writeFileInDir(logger, rpcWiringsFile, content.join('\n'))

    const { typesFile, envFile, rpcFile, authClientFile } =
      config.clientFiles ?? {}
    const importFrom = (from: string, to: string) =>
      getFileImportRelativePath(from, to, packageMappings)

    // Each file is opt-in by naming it in `clientFiles`, because each one
    // assumes a different part of the frontend stack.
    if (typesFile) {
      await writeFileInDir(
        logger,
        typesFile,
        serializeTypes(
          importFrom(typesFile, rpcMapDeclarationFile),
          config.scaffold?.analytics && config.analyticsFile
            ? importFrom(typesFile, config.analyticsFile)
            : undefined
        )
      )
    }
    if (envFile) {
      await writeFileInDir(logger, envFile, serializeEnv())
    }
    if (rpcFile) {
      if (!envFile) {
        logger.warn(
          'Skipping the RPC client: clientFiles.rpcFile is set but clientFiles.envFile is not — it reads the API base URL from the env file.'
        )
      } else {
        await writeFileInDir(
          logger,
          rpcFile,
          serializeRpc(
            importFrom(rpcFile, rpcWiringsFile),
            importFrom(rpcFile, envFile)
          )
        )
      }
    }
    if (authClientFile) {
      const { auth, functions } = await getInspectorState()
      if (!rpcFile || !envFile) {
        logger.warn(
          'Skipping the Better Auth client: clientFiles.authClientFile is set but clientFiles.rpcFile and clientFiles.envFile are not — it calls the session RPC through the first and the API base URL from the second.'
        )
      } else if (!auth.definition) {
        logger.warn(
          'Skipping the Better Auth client: clientFiles.authClientFile is set but the project does not declare pikkuBetterAuth.'
        )
      } else if (!functions.meta[SESSION_RPC]) {
        logger.warn(
          `Skipping the Better Auth client: it signs people in by calling the "${SESSION_RPC}" function, and the project does not define one.`
        )
      } else {
        await writeFileInDir(
          logger,
          authClientFile,
          serializeAuthClient(
            importFrom(authClientFile, rpcFile),
            importFrom(authClientFile, envFile),
            SESSION_RPC,
            config.clientAuth
          )
        )
      }
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating RPC wrappers',
      commandEnd: 'Generated RPC wrappers',
    }),
  ],
})
