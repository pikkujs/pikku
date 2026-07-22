import * as z from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'

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
 * Better Auth plugin that lets an authorized Fabric operator act as an admin of
 * a client app WITHOUT being one of its real users. Mirrors {@link actor}:
 * `POST /sign-in/fabric` with `{ token }` verifies a short-lived RS256 JWT the
 * Fabric control plane signed (checked against {@link FabricPluginOptions.publicKey}
 * — the existing `FABRIC_AUTH_PUBLIC_KEY`, not a shared secret) and mints a
 * session for a synthetic, `fabric: true` row created with `role: 'admin'` — so
 * it satisfies both the admin() plugin's permission checks (listUsers, …) and
 * pikku's `resolveImpersonatedSession` default `canImpersonate` (role === 'admin').
 * The token's `sub` is the operator id; the synthetic email is namespaced so it
 * can never collide with a real user, and sign-in against a real row is refused.
 *
 * Use ALONGSIDE better-auth's `admin()` plugin (which declares the `role`
 * column). Filter `fabric: true` rows out of any end-user listing.
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
            | FabricUser
            | undefined
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
              // Grants app-admin so admin() and impersonation authorize it.
              role: 'admin',
              createdAt: new Date(),
              updatedAt: new Date(),
            })) as unknown as FabricUser | undefined
            if (!user) {
              throw new APIError('INTERNAL_SERVER_ERROR', {
                message: 'Failed to create fabric user',
              })
            }
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id
          )
          if (!session) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'Failed to create fabric session',
            })
          }
          await setSessionCookie(ctx, { session, user: user as any })
          return ctx.json({
            token: session.token,
            user: { id: user.id, email, fabric: true },
          })
        }
      ),
    },
  }
}
