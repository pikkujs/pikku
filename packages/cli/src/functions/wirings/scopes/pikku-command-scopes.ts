import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeScopesTypes } from './serialize-scopes-types.js'
import { validateAndBuildScopeDefinitionsMeta } from '@pikku/core/scope'

export const pikkuScopes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { scopesFile, scopesMetaJsonFile } = config

    if (!scopesFile) {
      return
    }

    const state = await getInspectorState()

    const content = serializeScopesTypes({
      definitions: state.scopes.definitions,
    })
    await writeFileInDir(logger, scopesFile, content)

    if (scopesMetaJsonFile) {
      const meta = validateAndBuildScopeDefinitionsMeta(
        state.scopes.definitions
      )
      await writeFileInDir(
        logger,
        scopesMetaJsonFile,
        JSON.stringify(meta, null, 2)
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating PikkuScopes types',
      commandEnd: 'Created PikkuScopes types',
    }),
  ],
})
