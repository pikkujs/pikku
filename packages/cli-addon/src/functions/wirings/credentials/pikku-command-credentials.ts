import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeCredentialsTypes } from './serialize-credentials-types.js'
import { validateAndBuildCredentialDefinitionsMeta } from '@pikku/core/credential'

export const pikkuCredentials = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { credentialsFile, credentialsMetaJsonFile, packageMappings } = config

    if (!credentialsFile) {
      return
    }

    const state = await getInspectorState()

    if (!state.credentials || state.credentials.definitions.length === 0) {
      return
    }

    const content = serializeCredentialsTypes({
      definitions: state.credentials.definitions,
      schemaLookup: state.schemaLookup,
      credentialsFile,
      packageMappings,
    })
    await writeFileInDir(logger, credentialsFile, content)

    if (credentialsMetaJsonFile) {
      const meta = validateAndBuildCredentialDefinitionsMeta(
        state.credentials.definitions,
        state.schemaLookup
      )
      await writeFileInDir(
        logger,
        credentialsMetaJsonFile,
        JSON.stringify(meta, null, 2)
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating PikkuCredentials types',
      commandEnd: 'Created PikkuCredentials types',
    }),
  ],
})
