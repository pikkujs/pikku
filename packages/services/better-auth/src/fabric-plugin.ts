import * as z from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'
import type { Logger } from '@pikku/core/services'
import type { ScopeService } from '@pikku/core/services'
import { ADMIN_SCOPE_ROOT, OPERATOR_SCOPE_ROOTS } from './auth-scopes.js'

export interface FabricPluginOptions {
  /**
   * RSA public key (SPKI PEM) matching the Fabric control plane's signing key.
   * Fabric signs a short-lived RS256 token per operator session; this verifies
   * it. In Fabric deploys pass the `FABRIC_AUTH_PUBLIC_KEY` already distributed
   * to every stage — no per-environment secret needed, and asymmetric so the app
   * can never forge an operator login. Missing/empty disables the endpoint.
   */
  publicKey:
    | string
    | undefined
    | (() => string | undefined | Promise<string | undefined>)
  /** Reject tokens whose `purpose` claim isn't this. Defaults to `fabric-admin`. */
  purpose?: string
  /**
   * This stage's own identity — in Fabric deploys, `FABRIC_STAGE_ID`.
   *
   * Every stage verifies against the same `FABRIC_AUTH_PUBLIC_KEY`, so without
   * an audience an operator token is admin on all of them at once. That is
   * tolerable while the token never leaves the control plane, and not at all
   * once one is handed to something like CI.
   *
   * A token carrying `aud` is therefore refused unless this is configured and
   * matches — fail closed, so a stage that has not been told who it is cannot
   * be the weak one. Tokens without `aud` are unaffected, which is what keeps
   * the existing server-to-server callers working.
   */
  audience?:
    | string
    | undefined
    | (() => string | undefined | Promise<string | undefined>)
  /**
   * Grants the operator's synthetic row the `admin` scope on creation, which is
   * what authorizes it against the framework's `admin:*` gates. Without one the
   * operator signs in but holds nothing.
   */
  scopeService?: ScopeService
  /** Logger for the grant's configuration warnings. */
  logger?: Logger
}

/** Synthetic, guaranteed-non-colliding email for a Fabric operator's app row. */
const fabricEmail = (fabricUserId: string): string =>
  `fabric-${fabricUserId.toLowerCase()}@fabric.internal`

const b64urlToBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = s + '==='.slice((s.length + 3) % 4)
  const bin = atob(pad.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const pemToDer = (pem: string): Uint8Array<ArrayBuffer> => {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(body)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

interface FabricClaims {
  sub?: unknown
  name?: unknown
  purpose?: unknown
  aud?: unknown
  exp?: unknown
}

/**
 * Verify a fabric RS256 JWT with WebCrypto (works in Node and Cloudflare
 * Workers — no `node:crypto`). Returns the claims on a valid signature, else
 * null. A bad key, malformed token, or failed verification all reject.
 */
const verifyFabricToken = async (
  token: string,
  publicKeyPem: string
): Promise<FabricClaims | null> => {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) return null
  const [header, payload, signature] = parts
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey(
      'spki',
      pemToDer(publicKeyPem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    )
  } catch {
    // Malformed public key → cannot verify → reject.
    return null
  }
  let ok = false
  try {
    ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(signature),
      new TextEncoder().encode(`${header}.${payload}`)
    )
  } catch {
    // Malformed signature bytes → reject.
    return null
  }
  if (!ok) return null
  try {
    const claims = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(payload))
    ) as FabricClaims
    return claims && typeof claims === 'object' ? claims : null
  } catch {
    // Malformed payload JSON → reject.
    return null
  }
}

/**
 * Grants the operator's row the scopes an operator acts with.
 *
 * Re-checked on every sign-in rather than only when the row is created. The
 * grant below is deliberately not fatal, so a single failure used to leave that
 * operator permanently unprivileged with nothing to retry it; and a root added
 * to {@link OPERATOR_SCOPE_ROOTS} later would never have reached the operators
 * that already existed.
 *
 * A failure here is logged, not thrown: the operator gets an authenticated but
 * unprivileged session, which is a far clearer symptom than a 500 on sign-in.
 */
const grantOperatorScopes = async (
  options: FabricPluginOptions,
  userId: string
): Promise<void> => {
  const scopeService = options.scopeService
  if (!scopeService) {
    options.logger?.warn?.(
      `fabric: no ScopeService registered, so operator ${userId} holds no scopes`
    )
    return
  }
  try {
    const held = new Set(await scopeService.listUserScopes(userId))
    const missing = OPERATOR_SCOPE_ROOTS.filter((scope) => !held.has(scope))
    if (missing.length === 0) {
      return
    }
    // `admin` is this package's own root and is granted whether or not the app
    // spells it out, because the gates that check it live here. Any other root
    // has to be one the app declares, or the grant is a row nobody can trace
    // back to a declaration.
    const declared = missing.some((scope) => scope !== ADMIN_SCOPE_ROOT)
      ? new Set(
          (await scopeService.listScopes())
            .filter((scope) => scope.declared)
            .map((scope) => scope.id)
        )
      : new Set<string>()
    for (const scope of missing) {
      if (scope !== ADMIN_SCOPE_ROOT && !declared.has(scope)) {
        continue
      }
      await scopeService.addScopeToUser(userId, scope)
    }
  } catch (error) {
    options.logger?.warn?.(
      `fabric: could not grant operator scopes to ${userId}: ${error}`
    )
  }
}

/**
 * The stage's own id for the address an operator wants to act as.
 *
 * Resolved here rather than by the caller because there is nowhere else to
 * resolve it: impersonation names a user id, a persona only knows an email, and
 * since `admin()` was dropped no HTTP endpoint lists users. The adapter is
 * already in hand on this request and the operator token has already been
 * verified above, so the lookup costs nothing and is gated by the same check
 * that mints the session.
 *
 * Looked up before creating, so an address that already exists is acted as
 * rather than duplicated. Creation is opt-in: a persona is meant to be an
 * account somebody provisioned, and writing users into a live database is a
 * side effect nobody asked for.
 *
 * A `role` is written only when the caller names one. pikku no longer has a
 * `role` column of its own, but an app is free to keep better-auth's `admin()`
 * plugin, and those apps tend to constrain the column — creating a row without
 * one fails their CHECK. The caller knows the persona's roles; this does not.
 */
const resolveActAs = async (
  internalAdapter: {
    findUserByEmail: (
      email: string
    ) => Promise<{ user?: { id: unknown } } | null>
    createUser: (
      user: Record<string, unknown>
    ) => Promise<{ id: unknown } | undefined>
  },
  actAs: {
    email: string
    name?: string | undefined
    create?: boolean | undefined
    role?: string | undefined
  }
): Promise<{ userId: string }> => {
  const email = actAs.email.toLowerCase()
  const found = await internalAdapter.findUserByEmail(email)
  if (found?.user?.id) {
    return { userId: String(found.user.id) }
  }
  if (!actAs.create) {
    throw new APIError('NOT_FOUND', {
      message: `No account on this stage for ${actAs.email}`,
    })
  }
  const created = await internalAdapter.createUser({
    email,
    emailVerified: true,
    name: actAs.name ?? actAs.email,
    ...(actAs.role ? { role: actAs.role } : {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  if (!created?.id) {
    throw new APIError('INTERNAL_SERVER_ERROR', {
      message: `Failed to create an account for ${actAs.email}`,
    })
  }
  return { userId: String(created.id) }
}

/**
 * Better Auth plugin that lets an authorized Fabric operator act as an admin of
 * a client app WITHOUT being one of its real users. Mirrors {@link actor}:
 * `POST /sign-in/fabric` with `{ token }` verifies a short-lived RS256 JWT the
 * Fabric control plane signed (checked against {@link FabricPluginOptions.publicKey}
 * — the existing `FABRIC_AUTH_PUBLIC_KEY`, not a shared secret) and mints a
 * session for a synthetic, `fabric: true` row that is granted the umbrella
 * `admin` scope — which is what satisfies pikku's `admin:*` gates, including
 * `resolveImpersonatedSession`'s default `canImpersonate`.
 * The token's `sub` is the operator id; the synthetic email is namespaced so it
 * can never collide with a real user, and sign-in against a real row is refused.
 * A token naming an audience is accepted only by the stage it names — see
 * {@link FabricPluginOptions.audience}.
 *
 * Requires a {@link FabricPluginOptions.scopeService} for the grant to land.
 * Filter `fabric: true` rows out of any end-user listing.
 */
export const fabric = (options: FabricPluginOptions): BetterAuthPlugin => {
  const requiredPurpose = options.purpose ?? 'fabric-admin'
  return {
    id: 'fabric',
    schema: {
      user: {
        fields: {
          fabric: {
            type: 'boolean',
            required: false,
            input: false,
            defaultValue: false,
          },
        },
      },
    },
    endpoints: {
      signInFabric: createAuthEndpoint(
        '/sign-in/fabric',
        {
          method: 'POST',
          body: z.object({
            token: z.string(),
            actAs: z
              .object({
                email: z.string(),
                name: z.string().optional(),
                create: z.boolean().optional(),
                role: z.string().optional(),
              })
              .optional(),
          }),
        },
        async (ctx) => {
          const publicKey =
            typeof options.publicKey === 'function'
              ? await options.publicKey()
              : options.publicKey
          if (!publicKey) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Fabric sign-in is not configured',
            })
          }

          const claims = await verifyFabricToken(ctx.body.token, publicKey)
          if (!claims) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Invalid fabric token',
            })
          }
          const now = Math.floor(Date.now() / 1000)
          if (typeof claims.exp !== 'number' || claims.exp < now) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Fabric token expired',
            })
          }
          if (claims.purpose !== requiredPurpose) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Fabric token has the wrong purpose',
            })
          }
          if (claims.aud !== undefined) {
            const audience =
              typeof options.audience === 'function'
                ? await options.audience()
                : options.audience
            if (!audience || claims.aud !== audience) {
              throw new APIError('UNAUTHORIZED', {
                message: 'Fabric token was issued for another stage',
              })
            }
          }
          const fabricUserId = typeof claims.sub === 'string' ? claims.sub : ''
          if (!fabricUserId) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Fabric token is missing sub',
            })
          }
          const name = typeof claims.name === 'string' ? claims.name : undefined

          type FabricUser = { id: string; fabric?: boolean } & Record<
            string,
            unknown
          >
          const email = fabricEmail(fabricUserId)
          const existing =
            await ctx.context.internalAdapter.findUserByEmail(email)
          let user: FabricUser | undefined = existing?.user as
            FabricUser | undefined
          if (user && !user.fabric) {
            // Namespaced email should make this impossible, but never let a
            // fabric token mint a session for a real user row.
            throw new APIError('UNAUTHORIZED', {
              message: 'User is not a fabric operator',
            })
          }
          if (!user) {
            user = (await ctx.context.internalAdapter.createUser({
              email,
              emailVerified: true,
              name: name ?? 'Fabric',
              fabric: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            })) as unknown as FabricUser | undefined
            if (!user) {
              throw new APIError('INTERNAL_SERVER_ERROR', {
                message: 'Failed to create fabric user',
              })
            }
          }
          await grantOperatorScopes(options, user.id)

          const session = await ctx.context.internalAdapter.createSession(
            user.id
          )
          if (!session) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'Failed to create fabric session',
            })
          }
          await setSessionCookie(ctx, { session, user: user as any })
          const actAs = ctx.body.actAs
            ? await resolveActAs(
                ctx.context.internalAdapter as any,
                ctx.body.actAs
              )
            : undefined
          return ctx.json({
            token: session.token,
            user: { id: user.id, email, fabric: true },
            ...(actAs ? { actAs } : {}),
          })
        }
      ),
    },
  }
}
