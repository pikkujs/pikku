import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeSecretsTypes } from './serialize-secrets-types.js'

export const pikkuSecrets = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { secretsFile, packageMappings } = config

    if (!secretsFile) {
      return
    }

    const state = await getInspectorState()

    const content = serializeSecretsTypes({
      definitions: state.credentials.definitions,
      schemaLookup: state.schemaLookup,
      secretsFile,
      packageMappings,
    })
    await writeFileInDir(logger, secretsFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating PikkuSecrets types',
      commandEnd: 'Created PikkuSecrets types',
    }),
  ],
})
