import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeScopesTypes } from './serialize-scopes-types.js'
import { validateAndBuildScopeDefinitionsMeta } from '@pikku/core/scope'

export const pikkuScopes = pikkuSessionlessFunc<{ bootstrap?: boolean }, void>({
  func: async ({ logger, config, getInspectorState }, data) => {
    const { scopesFile, scopesMetaJsonFile } = config

    if (!scopesFile) {
      return
    }

    // On a cold .pikku this runs before pikku-types.gen.ts exists, so it must
    // take the zero state rather than a full inspect — inspecting here would
    // try to import the project's zod schemas, which resolve '#pikku' and fail.
    // The file only has to exist so function types can import ScopeId; the real
    // Scopes step regenerates it with the declarations once setup has run.
    const bootstrap = data?.bootstrap ?? false
    const state = await getInspectorState(false, bootstrap, bootstrap)

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
