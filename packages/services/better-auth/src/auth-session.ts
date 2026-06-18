import type {
  CoreUserSession,
  CorePikkuMiddleware,
  CoreServices,
} from '@pikku/core'
import { pikkuMiddleware } from '@pikku/core'
import type { BetterAuthInstance } from './define-auth.js'

type BetterAuthSessionResult = { user: any; session: any }

/**
 * The shape returned by the API Key plugin's `verifyApiKey` endpoint. `key`
 * carries the machine identity and its scope (`userId`, `metadata`,
 * `permissions`) — this is the channel scope rides on for the machine path,
 * because better-auth's `getSession()` returns only a bare mock session for an
 * API key and drops the metadata.
 */
type VerifiedApiKey = { valid: boolean; error: unknown; key: any }

type BetterAuthSessionOptions = {
  /**
   * Map a human/cookie/bearer session (from `getSession`) to the app session.
   */
  mapSession?: (result: BetterAuthSessionResult) => CoreUserSession
  /**
   * Resolve machine (API key) callers statelessly. When the configured header
   * is present the middleware calls `verifyApiKey` and, if valid, maps the
   * verified key to the app session. Scope must be derived here (not from
   * `getSession`) — see {@link VerifiedApiKey}.
   */
  apiKey?: {
    /** Header carrying the raw API key. Defaults to `x-api-key`. */
    header?: string
    /**
     * Map a verified API key to the app session. Receives the singleton
     * services so callers can resolve current scope (e.g. look up the owning
     * resource row) rather than trusting only what is baked into the key.
     * Return `null`/`undefined` to reject the caller.
     */
    mapKey: (
      key: any,
      services: CoreServices
    ) =>
      | CoreUserSession
      | null
      | undefined
      | Promise<CoreUserSession | null | undefined>
  }
}

export const betterAuthSession = (
  options: BetterAuthSessionOptions = {}
): CorePikkuMiddleware => {
  const { mapSession, apiKey } = options
  const apiKeyHeader = apiKey?.header ?? 'x-api-key'

  return pikkuMiddleware(
    async (services, { http, setSession, session }, next) => {
      if (!http?.request || !setSession || session) {
        return next()
      }

      // --- Machine path: stateless API key resolution -----------------------
      // Handled before getSession because getSession would otherwise return a
      // metadata-less mock session for the same key, masking the scoped one.
      if (apiKey) {
        const rawKey = http.request.header(apiKeyHeader)
        if (rawKey) {
          try {
            const auth = (await (services as any).auth()) as BetterAuthInstance
            const verified = (await auth.api.verifyApiKey({
              body: { key: rawKey },
            })) as VerifiedApiKey | null

            if (verified?.valid && verified.key) {
              const mapped = await apiKey.mapKey(
                verified.key,
                services as CoreServices
              )
              if (mapped) {
                setSession(mapped)
              }
            }
          } catch (e: any) {
            services.logger?.warn(
              `better-auth api-key verify failed: ${e?.message}`
            )
          }
          // The api-key header is authoritative for this request — never fall
          // through to getSession (a bare mock session would shadow our scope).
          return next()
        }
      }

      // --- Human path: cookie / bearer session ------------------------------
      try {
        const auth = (await (services as any).auth()) as BetterAuthInstance
        // getSession only needs the request headers — build them directly
        // instead of going through toWebRequest(), which (for a POST) would
        // otherwise read the single-use request body just to discard it,
        // starving the route handler that actually needs it.
        const result = (await auth.api.getSession({
          headers: new Headers(http.request.headers()),
        })) as BetterAuthSessionResult | null

        if (result?.user) {
          setSession(
            mapSession
              ? mapSession(result)
              : ({ userId: result.user.id } as CoreUserSession)
          )
        }
      } catch (e: any) {
        services.logger?.warn(`better-auth session read failed: ${e?.message}`)
      }

      return next()
    }
  )
}
