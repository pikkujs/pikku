import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeSecretsTypes } from './serialize-secrets-types.js'
import { validateAndBuildSecretDefinitionsMeta } from '@pikku/core/secret'

export const pikkuSecrets = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { secretsFile, secretsMetaJsonFile, packageMappings } = config

    if (!secretsFile) {
      return
    }

    const state = await getInspectorState()

    const content = serializeSecretsTypes({
      definitions: state.secrets.definitions,
      schemaLookup: state.schemaLookup,
      secretsFile,
      packageMappings,
    })
    await writeFileInDir(logger, secretsFile, content)

    if (secretsMetaJsonFile) {
      const meta = validateAndBuildSecretDefinitionsMeta(
        state.secrets.definitions,
        state.schemaLookup
      )
      await writeFileInDir(
        logger,
        secretsMetaJsonFile,
        JSON.stringify(meta, null, 2)
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating PikkuSecrets types',
      commandEnd: 'Created PikkuSecrets types',
    }),
  ],
})
