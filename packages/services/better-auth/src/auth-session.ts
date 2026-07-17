import type {
  CoreUserSession,
  CorePikkuMiddleware,
  CoreServices,
} from '@pikku/core'
import { pikkuMiddleware } from '@pikku/core'
import type { BetterAuthInstance } from './define-auth.js'
import { stampActorFlag } from './stamp-actor-flag.js'
import {
  resolveImpersonatedSession,
  type ImpersonationOptions,
} from './auth-session-impersonation.js'
import { withResolvedScopes } from './auth-session-scopes.js'

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
   * Receives the singleton `services` so callers can enrich the session from
   * their own data (e.g. look up org membership) instead of returning only
   * what better-auth knows. May be async. Mirrors `apiKey.mapKey`.
   */
  mapSession?: (
    result: BetterAuthSessionResult,
    services: CoreServices
  ) => CoreUserSession | Promise<CoreUserSession>
  impersonation?: ImpersonationOptions
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
     *
     * Set `scopes` here to mint a *restricted* key: an explicit set (including
     * an empty one) is authoritative and is never widened back out to
     * everything the owning user holds. Leave it unset for a key that acts with
     * its owner's full rights.
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
  const { mapSession, apiKey, impersonation } = options
  const apiKeyHeader = apiKey?.header ?? 'x-api-key'

  return pikkuMiddleware(
    async (services, { http, setSession, session }, next) => {
      if (!http?.request || !setSession || session) {
        return next()
      }
      // Capture the narrowed request so deferred closures (the impersonation
      // header reader below) keep the non-null type.
      const request = http.request

      // --- Machine path: stateless API key resolution -----------------------
      // Handled before getSession because getSession would otherwise return a
      // metadata-less mock session for the same key, masking the scoped one.
      if (apiKey) {
        const rawKey = request.header(apiKeyHeader)
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
                setSession(
                  await withResolvedScopes(mapped, services as CoreServices)
                )
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
      // Read the session in its own try: a genuine getSession failure (DB down,
      // bad secret) must surface, not silently degrade to anonymous. The normal
      // "not logged in" path returns null here — it does not throw.
      let result: BetterAuthSessionResult | null
      try {
        const auth = (await (services as any).auth()) as BetterAuthInstance
        // getSession only needs the request headers — build them directly
        // instead of going through toWebRequest(), which (for a POST) would
        // otherwise read the single-use request body just to discard it,
        // starving the route handler that actually needs it.
        result = (await auth.api.getSession({
          headers: new Headers(request.headers()),
        })) as BetterAuthSessionResult | null
      } catch (e: any) {
        services.logger?.error(
          `better-auth getSession failed: ${e?.message ?? e}`
        )
        throw e
      }

      // mapSession / impersonation hooks are caller code — let their errors
      // propagate (a thrown claim assertion is a deliberate signal, not a reason
      // to silently fall back to anonymous and serve a baffling 403).
      if (result?.user) {
        if (impersonation) {
          const impersonated = await resolveImpersonatedSession(
            result,
            impersonation,
            services as CoreServices,
            (name) => request.header(name),
            mapSession
          )
          if (impersonated) {
            // Scopes resolve for the impersonated userId, not the admin's — an
            // impersonated session runs as the target, with the target's rights.
            setSession(
              await withResolvedScopes(impersonated, services as CoreServices)
            )
            return next()
          }
        }
        const mapped = mapSession
          ? await mapSession(result, services as CoreServices)
          : ({ userId: result.user.id } as CoreUserSession)
        setSession(
          await withResolvedScopes(
            stampActorFlag(mapped, result.user),
            services as CoreServices
          )
        )
      }

      return next()
    }
  )
}
