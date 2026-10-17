import type {
  EntryGenerationContext,
  PlatformServiceContributor,
} from '@pikku/deploy'

const hasCoercionMap = (ctx: EntryGenerationContext) =>
  Object.keys(ctx.coercionMap ?? {}).length > 0

/**
 * Attaches the app's column coercion map to the `kysely` the platform services
 * hand `createSingletonServices`, which is where `pikku dev` attaches it. A
 * libsql or Postgres stage returns dates, booleans and json columns as stored;
 * without this a deployed query returns those raw values where the same query
 * under `pikku dev` returns a Date, a boolean and an object.
 *
 * It wraps the instance an earlier contributor built, so it has to run after
 * the one that sets `services.kysely`. The adapter appends it last for that
 * reason.
 */
export const coercionContributor: PlatformServiceContributor = {
  name: 'kysely-coercion',
  imports: (_platform, ctx) =>
    hasCoercionMap(ctx)
      ? [`import { createCoercionPlugin } from '@pikku/kysely'`]
      : [],
  emit: ({ ctx }) =>
    hasCoercionMap(ctx)
      ? [
          `  if (services.kysely) {`,
          `    services.kysely = services.kysely.withPlugin(`,
          `      createCoercionPlugin({ map: ${JSON.stringify(ctx.coercionMap)} })`,
          `    )`,
          `  }`,
        ]
      : [],
}
