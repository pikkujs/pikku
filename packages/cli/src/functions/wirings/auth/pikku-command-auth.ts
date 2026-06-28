import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeAuthGen } from './serialize-auth-gen.js'
import {
  serializeAuthTypes,
  serializeAuthTypesBootstrap,
} from './serialize-auth-types.js'
import { serializeAuthMeta } from './serialize-auth-meta.js'
import { projectDeclaresBetterAuth } from '../../../utils/detect-better-auth.js'

export const pikkuAuth = pikkuSessionlessFunc<{ bootstrap?: boolean }, void>({
  func: async ({ logger, config, getInspectorState }, data) => {
    const {
      authFile,
      authTypesFile,
      authMetaJsonFile,
      functionTypesFile,
      typesDeclarationFile,
      secretsFile: secretsServiceFile,
      variablesFile,
      packageMappings,
    } = config
    if (!authFile) return

    // Bootstrap pass: the inspector hasn't run, so the typed wrapper can't be
    // built. If the project uses better-auth, pre-write a stub auth.types.ts so
    // the `pikkuBetterAuth` re-export resolves during the first full inspect /
    // a standalone `pikku db generate`. The typed wrapper replaces it later.
    if (data?.bootstrap) {
      if (
        authTypesFile &&
        (await projectDeclaresBetterAuth(
          config.rootDir,
          config.srcDirectories,
          config.ignoreFiles
        ))
      ) {
        await writeFileInDir(logger, authTypesFile, serializeAuthTypesBootstrap())
      }
      return
    }

    const state = await getInspectorState()
    // Only generate when the project declares auth via `pikkuBetterAuth`. Gating on
    // the definition (not provider count) means credentials-only auth — which
    // has no OAuth providers — still generates its /auth/* wiring.
    if (!state.auth.definition) return

    const { wiring, secrets, middleware } = serializeAuthGen(
      state.auth.definition,
      state.auth.providers,
      authFile,
      typesDeclarationFile,
      packageMappings ?? {},
      state.auth.hasUserSessionMiddleware ?? false
    )
    // The secrets file sits alongside authFile so re-inspection rediscovers it.
    // It is kept separate from the wiring file because the CLI forbids Zod
    // schemas and HTTP wiring (wireHTTPRoutes) in the same file (PKU490).
    const secretsFile = join(dirname(authFile), 'auth-secrets.gen.ts')
    await writeFileInDir(logger, authFile, wiring)
    await writeFileInDir(logger, secretsFile, secrets)

    // Stateless split: session middleware in its own file (see serializeAuthGen).
    // Skip it when the project registers its own betterAuthStatelessSession — the
    // generated default-map one would run first and pre-empt the user's custom
    // mapSession (pikkujs/pikku#754). Remove a stale file so it can't linger and
    // double-register.
    const middlewareFile = join(dirname(authFile), 'auth-middleware.gen.ts')
    if (middleware && !state.auth.userStatelessSession) {
      await writeFileInDir(logger, middlewareFile, middleware)
    } else if (existsSync(middlewareFile)) {
      await rm(middlewareFile, { force: true })
    }

    // Static metadata of the enabled providers/plugins for the console SSO page,
    // following the `*-meta.gen.json` convention. Read at runtime by the console
    // getAuthProviders function instead of a runtime registry.
    if (authMetaJsonFile) {
      const meta = serializeAuthMeta(
        state.auth.definition,
        state.auth.providers
      )
      await writeFileInDir(
        logger,
        authMetaJsonFile,
        JSON.stringify(meta, null, 2)
      )
    }

    // Generate the typed pikkuBetterAuth re-export consumed by `import { pikkuBetterAuth } from '#pikku'`.
    if (
      authTypesFile &&
      functionTypesFile &&
      secretsServiceFile &&
      variablesFile
    ) {
      const authTypes = serializeAuthTypes(
        authTypesFile,
        functionTypesFile,
        secretsServiceFile,
        variablesFile,
        packageMappings ?? {}
      )
      await writeFileInDir(logger, authTypesFile, authTypes)
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating auth.gen.ts',
      commandEnd: 'Generated auth.gen.ts',
    }),
  ],
})
