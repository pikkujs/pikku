import { join, dirname } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeAuthGen } from './serialize-auth-gen.js'
import { serializeAuthTypes } from './serialize-auth-types.js'

export const pikkuAuth = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { authFile, authTypesFile, functionTypesFile, packageMappings } = config
    if (!authFile) return

    const state = await getInspectorState()
    // Only generate when the project declares auth via `defineAuth`. Gating on
    // the definition (not provider count) means credentials-only auth — which
    // has no OAuth providers — still generates its /auth/* wiring.
    if (!state.auth.definition) return

    const { wiring, secrets } = serializeAuthGen(
      state.auth.definition,
      state.auth.providers,
      authFile,
      packageMappings ?? {}
    )
    // The secrets file sits alongside authFile so re-inspection rediscovers it.
    // It is kept separate from the wiring file because the CLI forbids Zod
    // schemas and HTTP wiring (wireHTTPRoutes) in the same file (PKU490).
    const secretsFile = join(dirname(authFile), 'auth-secrets.gen.ts')
    await writeFileInDir(logger, authFile, wiring)
    await writeFileInDir(logger, secretsFile, secrets)

    // Generate the typed defineAuth re-export consumed by `import { defineAuth } from '#pikku'`.
    if (authTypesFile && functionTypesFile) {
      const authTypes = serializeAuthTypes(authTypesFile, functionTypesFile)
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
