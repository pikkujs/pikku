import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeAuthGen } from './serialize-auth-gen.js'

export const pikkuAuth = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { authFile } = config
    if (!authFile) return

    const state = await getInspectorState()
    if (state.auth.providers.length === 0) return

    const content = serializeAuthGen(state.auth.providers)
    await writeFileInDir(logger, authFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating auth.gen.ts',
      commandEnd: 'Generated auth.gen.ts',
    }),
  ],
})
