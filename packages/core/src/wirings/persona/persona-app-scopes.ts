import type { ScopeDefinitionMeta, ScopeNodeMeta } from '../scope/scope.types.js'
import type { PersonaMeta } from './persona.types.js'

/**
 * The root every app grant hangs off. One segment, so a grant of `app` alone
 * means "may use all of them" under the same parent-grant rule the admin tree
 * relies on — which is what a support operator or an internal tool wants, and
 * what a per-app boolean column could never express.
 */
export const APP_SCOPE_ROOT = 'app'

/** `app:staff` for `staff`. */
export const appScopeId = (app: string) => `${APP_SCOPE_ROOT}:${app}`

/**
 * The apps named across the declared personas, sorted and deduplicated.
 *
 * The personas *are* the registry. There is no separate list of apps to keep in
 * step, because a frontend nobody signs into is not a thing the auth layer has
 * an opinion about — and the moment somebody does sign into it, they are a
 * persona and they name it.
 */
export const declaredApps = (personas: PersonaMeta[]): string[] =>
  [
    ...new Set(
      personas
        .map((persona) => persona.app)
        .filter((app): app is string => typeof app === 'string' && app !== '')
    ),
  ].sort()

/**
 * The `app` scope tree, synthesised from the personas that name an app.
 *
 * Which frontend a person may sign into is a different question from what they
 * may do once inside it, but it is the same *kind* of question — a grant that
 * an admin can make and revoke at runtime, that resolves at the session
 * boundary, and that a restricted API key can decline to inherit. So it is
 * carried as a scope rather than a `can_access_<app>` column: no migration per
 * app, one query for "which apps may this user reach", and no second
 * authorization mechanism to keep honest.
 *
 * Synthesised rather than written by hand because the declaration already
 * exists. Asking an app to also spell out `defineScope({ app: { staff: {} } })`
 * beside its personas invites the two to drift, and the failure that produces —
 * a persona provisioned with a grant the vocabulary no longer declares — is one
 * `pikku scopes prune` away from silently revoking sign-in.
 *
 * Null when no persona names an app, which is the single-frontend case: nothing
 * to declare, and no empty root cluttering the console's grant list.
 */
export const buildAppScopeDefinition = (
  personas: PersonaMeta[]
): ScopeDefinitionMeta | null => {
  const apps = declaredApps(personas)
  if (apps.length === 0) {
    return null
  }

  const scopes: Record<string, ScopeNodeMeta> = {}
  for (const app of apps) {
    scopes[app] = {
      displayName: app,
      description: `May sign in to the ${app} app`,
    }
  }

  return {
    name: APP_SCOPE_ROOT,
    displayName: 'Apps',
    description: 'Which frontend a person may sign in to',
    scopes,
  }
}
