import * as z from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'

export interface FabricPluginOptions {
  /**
   * Per-environment shared secret. The Fabric control plane provisions a unique
   * value per stage/sandbox and reads its own copy to broker sessions; the app
   * reads its copy here to verify. Missing/empty disables the endpoint.
   */
  secret:
    | string
    | undefined
    | (() => string | undefined | Promise<string | undefined>)
}

/** Length-hiding constant-time comparison — no early exit on mismatch. */
const secretsEqual = (a: string, b: string): boolean => {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  let diff = ab.length ^ bb.length
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  }
  return diff === 0
}

/** Synthetic, guaranteed-non-colliding email for a Fabric operator's app row. */
const fabricEmail = (fabricUserId: string): string =>
  `fabric-${fabricUserId.toLowerCase()}@fabric.internal`

/**
 * Better Auth plugin that lets an authorized Fabric operator act as an admin of
 * a client app WITHOUT being one of its real users. Mirrors {@link actor}:
 * `POST /sign-in/fabric` with `{ fabricUserId, secret }` checks a per-environment
 * shared secret and mints a session for a synthetic, `fabric: true` row created
 * with `role: 'admin'` — so it satisfies both the admin() plugin's permission
 * checks (listUsers, …) and pikku's `resolveImpersonatedSession` default
 * `canImpersonate` (role === 'admin'). The synthetic email is namespaced so it
 * can never collide with a real user; sign-in against a real row is refused.
 *
 * Use ALONGSIDE better-auth's `admin()` plugin (which declares the `role`
 * column). Filter `fabric: true` rows out of any end-user listing.
 */
export const fabric = (options: FabricPluginOptions): BetterAuthPlugin => {
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
            fabricUserId: z.string(),
            name: z.string().optional(),
            secret: z.string(),
          }),
        },
        async (ctx) => {
          const expected =
            typeof options.secret === 'function'
              ? await options.secret()
              : options.secret
          if (!expected) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Fabric sign-in is not configured',
            })
          }
          if (!secretsEqual(ctx.body.secret, expected)) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Invalid fabric secret',
            })
          }

          type FabricUser = { id: string; fabric?: boolean } & Record<
            string,
            unknown
          >
          const email = fabricEmail(ctx.body.fabricUserId)
          const existing =
            await ctx.context.internalAdapter.findUserByEmail(email)
          let user: FabricUser | undefined = existing?.user as
            | FabricUser
            | undefined
          if (user && !user.fabric) {
            // Namespaced email should make this impossible, but never let the
            // secret mint a session for a real user row.
            throw new APIError('UNAUTHORIZED', {
              message: 'User is not a fabric operator',
            })
          }
          if (!user) {
            user = (await ctx.context.internalAdapter.createUser({
              email,
              emailVerified: true,
              name: ctx.body.name ?? 'Fabric',
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
