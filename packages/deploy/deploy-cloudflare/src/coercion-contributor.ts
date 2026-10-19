import type { Contributor } from '@pikku/core/contributors'
import { createCoercionPlugin } from '@pikku/kysely'

/** The name the adapter selects the coercion contributor under. */
export const COERCION_CONTRIBUTOR_NAME = 'kysely-coercion'

const hasCoercionMap = (map: object | undefined): boolean =>
  Object.keys(map ?? {}).length > 0

/**
 * Attaches the app's column coercion map to the `kysely` the platform services
 * hand `createSingletonServices`, which is where `pikku dev` attaches it. A
 * libsql or Postgres stage returns dates, booleans and json columns as stored;
 * without this a deployed query returns those raw values where the same query
 * under `pikku dev` returns a Date, a boolean and an object.
 *
 * It decorates (empty `provides`) the instance the contributor providing
 * `kysely` built, so it runs after it. The adapter selects it itself, and only
 * when the app has a map and something provides `kysely`.
 */
export const coercionContributor: Contributor = {
  provides: [],
  needs: ['kysely'],
  when: (platform) => hasCoercionMap(platform.db?.coercionMap),
  run(services, _env, _runtime, platform) {
    if (!services.kysely) return
    services.kysely = services.kysely.withPlugin(
      createCoercionPlugin({ map: platform.db!.coercionMap! })
    )
  },
}
