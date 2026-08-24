import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeScopesTypes } from './serialize-scopes-types.js'
import { serializeScopesClient } from './serialize-scopes-client.js'
import { validateAndBuildScopeDefinitionsMeta } from '@pikku/core/scope'
import { APP_SCOPE_ROOT, buildAppScopeDefinition } from '@pikku/core/persona'
import type { PersonaDefinitions } from '@pikku/core/persona'
import type { ScopeDefinitions } from '@pikku/core/scope'

/**
 * The declared scopes, plus the `app` tree derived from the personas.
 *
 * Appended here rather than in the inspector because it is not a declaration
 * the AST can find: it is the personas' `app` field read as a scope, and this
 * is the one place the two states are both in hand.
 */
export const withAppScopes = (
  scopes: ScopeDefinitions,
  personas: PersonaDefinitions
): ScopeDefinitions => {
  const declared = scopes.find((scope) => scope.name === APP_SCOPE_ROOT)
  if (declared) {
    throw new Error(
      `'${APP_SCOPE_ROOT}' is reserved: it is derived from the apps your personas name, and ${declared.sourceFile ?? 'a defineScope call'} declares it too. Rename that scope root — two trees answering to one name make a grant ambiguous.`
    )
  }

  const appScopes = buildAppScopeDefinition(personas)
  return appScopes ? [...scopes, appScopes] : scopes
}

export const pikkuScopes = pikkuSessionlessFunc<{ bootstrap?: boolean }, void>({
  func: async ({ logger, config, getInspectorState }, data) => {
    const { scopesFile, scopesMetaJsonFile } = config
    const scopesClientFile = config.clientFiles?.scopesFile

    if (!scopesFile) {
      return
    }

    // On a cold .pikku this runs before the function leaf exists, so it must
    // take the zero state rather than a full inspect — inspecting here would
    // try to import the project's zod schemas, which resolve '#pikku/function'
    // and fail.
    // The file only has to exist so function types can import ScopeId; the real
    // Scopes step regenerates it with the declarations once setup has run.
    const bootstrap = data?.bootstrap ?? false
    const state = await getInspectorState(false, bootstrap, bootstrap)

    const definitions = withAppScopes(state.scopes.definitions, state.personas.definitions)

    const content = serializeScopesTypes({
      definitions,
    })
    await writeFileInDir(logger, scopesFile, content)

    if (scopesClientFile) {
      await writeFileInDir(
        logger,
        scopesClientFile,
        serializeScopesClient({ definitions })
      )
    }

    if (scopesMetaJsonFile) {
      const meta = validateAndBuildScopeDefinitionsMeta(definitions)
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
