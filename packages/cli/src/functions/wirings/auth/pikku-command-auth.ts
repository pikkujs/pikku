import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeAuthGen } from './serialize-auth-gen.js'

export const pikkuAuth = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { authFile, packageMappings } = config
    if (!authFile) return

    const state = await getInspectorState()
    // Only generate when the project declares auth via `defineAuth`. Gating on
    // the definition (not provider count) means credentials-only auth — which
    // has no OAuth providers — still generates its /auth/* wiring.
    if (!state.auth.definition) return

    const content = serializeAuthGen(
      state.auth.definition,
      state.auth.providers,
      authFile,
      packageMappings ?? {}
    )
    await writeFileInDir(logger, authFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating auth.gen.ts',
      commandEnd: 'Generated auth.gen.ts',
    }),
  ],
})
