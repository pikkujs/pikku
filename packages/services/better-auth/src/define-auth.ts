import type { CoreSingletonServices } from '@pikku/core'

/**
 * The minimal structural shape of a configured better-auth instance that Pikku
 * needs. A `betterAuth(...)` return value (`Auth<Options>`) is structurally
 * assignable to this for ANY options — `handler` matches exactly and `api` is a
 * record of endpoints — so we avoid fighting better-auth's per-options generics.
 */
export interface BetterAuthInstance {
  /** Web-standard fetch handler: takes a Request, returns a Response. */
  handler: (request: Request) => Promise<Response>
  /** Server-side API surface (getSession, signInEmail, ...). */
  api: Record<string, any>
}

/**
 * Factory invoked once, lazily, on the first auth request with the singleton
 * services. It returns a configured better-auth instance — the user builds it
 * with `betterAuth({...})`, pulling secrets/DB off `services`:
 *
 * ```ts
 * export const auth = defineAuth(async (services) =>
 *   betterAuth({
 *     database: { db: services.kysely, type: 'postgres' },
 *     socialProviders: { github: await services.secrets.getSecret('GITHUB_OAUTH') },
 *     plugins: [organization(), twoFactor()],
 *   })
 * )
 * ```
 */
export type DefineAuthFactory = (
  services: CoreSingletonServices
) => BetterAuthInstance | Promise<BetterAuthInstance>

/**
 * The value `defineAuth` returns. It has NO side effects at module load — the
 * user exports it (`export const auth = defineAuth(...)`) and the pikku CLI
 * statically inspects the inner `betterAuth({...})` call to generate the
 * catch-all `/api/auth/**` HTTP wiring, the session middleware, and the
 * `wireSecret` calls for each configured social provider.
 *
 * `getInstance` resolves (and caches) the better-auth instance on first use.
 */
export interface DefinedAuth {
  getInstance: (services: CoreSingletonServices) => Promise<BetterAuthInstance>
}

/**
 * Declare a better-auth configuration for Pikku.
 *
 * Unlike a `wire*` helper this has NO side effects: it returns a
 * {@link DefinedAuth} the project exports. The factory is invoked lazily (on the
 * first auth request) because it needs the singleton `services`, and the
 * resolved instance is cached for subsequent requests.
 *
 * Exactly one `defineAuth` is allowed per codebase (the CLI errors otherwise).
 */
export const defineAuth = (factory: DefineAuthFactory): DefinedAuth => {
  let instance: BetterAuthInstance | null = null
  let pending: Promise<BetterAuthInstance> | null = null
  return {
    getInstance: async (services) => {
      if (instance) return instance
      // Guard against concurrent first-requests building the instance twice.
      pending ??= Promise.resolve(factory(services)).then((resolved) => {
        instance = resolved
        return resolved
      })
      return pending
    },
  }
}
