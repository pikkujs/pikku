//~ name: auth-session
//~ title: Custom session fields (role / organizationId) — UserSession + mapSession
//~ when: A function or permission needs a field on the logged-in session beyond `userId` — a role, the active org/team id, a locale. This is the #1 auth pitfall: a field added to the type is `undefined` at runtime until `mapSession` populates it. You must do BOTH steps below.
//~ lang: ts
//~ steps:
//~ STEP 1 — add the field to the EXISTING `UserSession` interface in
//~ packages/functions/src/application-types.d.ts. That file already declares
//~ `export interface UserSession extends CoreUserSession { userId: string }` —
//~ just add your field to it (the first commented block below is the shape):
//~
//~   export interface UserSession extends CoreUserSession {
//~     userId: string
//~     role?: string             // ← optional unless you added the admin() plugin
//~     organizationId?: string   // ← the active org/team (organization() plugin)
//~   }
//~
//~ ⚠️ NEVER create a new `.d.ts` with `declare module '#pikku/*'`. `#pikku/*` is a
//~ SUBPATH IMPORT (package.json "imports"), not a package — an ambient
//~ `declare module '#pikku/*'` REPLACES it and erases every real export
//~ (pikkuFunc, pikkuBetterAuth, …). The whole app stops type-checking and
//~ booting. Edit the UserSession interface in application-types.d.ts. Nothing else.
//~
//~ STEP 2 — populate the fields by registering your OWN global session middleware
//~ with a `mapSession`. CREATE the file — it does not exist yet, so do not go looking
//~ for it: `packages/functions/src/middleware/session.middleware.ts`, beside the
//~ `cors.middleware.ts` the starter already ships there. The code below is what goes
//~ in it.
//~
//~ ⚠️ READ THIS FIRST — it kills the three wrong turns everyone takes here (do NOT
//~ waste turns re-deriving this; the mechanism is settled):
//~  • You are NOT double-registering. The generated bridge lives in
//~    packages/functions/src/scaffold/auth/auth-middleware.gen.ts. The MOMENT you add your
//~    own betterAuthStatelessSession below and run `pikku all` (codegen), the CLI
//~    DELETES that generated file entirely (pikkujs/pikku#754) — so EXACTLY ONE
//~    session middleware runs: yours. `ls` it after codegen and watch it vanish.
//~  • Do NOT edit auth-middleware.gen.ts. It is AUTO-GENERATED and about to be
//~    deleted — any edit is discarded. Your mapSession goes in the file you create
//~    in STEP 2, nowhere else.
//~  • Do NOT try to thread mapSession through pikkuBetterAuth in auth.ts. There is NO
//~    such option on the wrapper; mapSession exists ONLY on betterAuthStatelessSession.
//~
//~ ⚠️ CARRY OVER the authBearer(PIKKU_CONSOLE_TOKEN) block too. The generated file
//~ you're replacing had it in the SAME addHTTPMiddleware array — and because #754
//~ removes the WHOLE file, dropping it here silently breaks the Fabric console/agent
//~ (they read the app with that bearer token, so every console read starts 403'ing).
//~ Keep it verbatim as the 2nd entry below.
//~
//~ The starter uses Better Auth's stateless cookie session, so use
//~ betterAuthStatelessSession (use betterAuthSession only if you turned cookieCache off).
//~
//~ SCOPES (capability gates): if you gate any function with `scopes: [...]` (see the
//~ `wire-scope` scaffold), you MUST grant them in the SAME mapSession object below —
//~ `session.scopes` set by mapSession is authoritative, and a gated function 403s
//~ anyone who wasn't granted the scope (fail-closed). Derive from role; '*' grants all:
//~   scopes: (result.user as { role?: string }).role === 'admin' ? ['*'] : [],
//~ OMIT that line entirely if the app has no `scopes:`-gated functions.
//~
//~ FIELD FROM A LINK TABLE (the tenant is NOT on the Better Auth user/session).
//~ When the scope lives in your OWN join table — NOT a Better Auth plugin column —
//~ `mapSession` is ASYNC and receives the singleton `services` as its 2nd arg, so
//~ query there. DO NOT reach for databaseHooks, a second middleware, or the Better
//~ Auth MCP — this async-services signature is a pikku wrapper feature. (This is the
//~ LINK-TABLE case. If instead you added the Better Auth `organization()` PLUGIN,
//~ the active org lives on the session as `activeOrganizationId` — read it as shown
//~ in the mapSession below, and do the sign-up org-bootstrap in databaseHooks the way
//~ Better Auth's organization() plugin documents; that is the ONE place databaseHooks
//~ is right.) Still NEVER throw (runs every request). The second commented block below
//~ uses a generic `membership → tenantId` join; rename it to YOUR link table + scope
//~ field.
//~
//~ STEP 3 — read it from the 3rd arg in functions/permissions; NEVER re-query the
//~ DB for a field that belongs on the session.
//~
//~ ⚠️ THE FIRST USER OF A BRAND-NEW APP HAS NO TENANT ROWS. The person who signs
//~ up (and the smoke/verify user) has zero orgs/workspaces/warehouses — so any
//~ custom tenant field (organizationId, warehouseId, …) is `undefined` for them.
//~ This is the #1 cause of a dashboard that 500s on every fresh login:
//~   const warehouseId = session.warehouseId!        // ← undefined at runtime!
//~   .where('warehouseId', '=', warehouseId)         // ← WHERE x = undefined → 500
//~ NEVER assert a tenant field with `!` and NEVER pass it into a query unguarded.
//~ A READ/list/dashboard function MUST return safe empty defaults when it is
//~ absent (so a new user sees an empty-but-working app, not a 500) — the last
//~ commented block below is that shape.
//~
//~ STEP 4 — BOOTSTRAP a default tenant so the app isn't empty forever, or the first
//~ write 500s. FOR THE organization() PLUGIN: put databaseHooks on the auth config that
//~ create + activate a default org on sign-up, as that plugin documents — that is the
//~ ONE place databaseHooks is right. FOR A LINK-TABLE tenant: on the first
//~ authenticated write (or in mapSession), if the user has no tenant row, create one
//~ and use it — don't make the user hit a dead end. Only a function that genuinely
//~ cannot proceed without a tenant may throw, and even then prefer creating the
//~ default over erroring. (`permissions` may still gate on a role:
//~   permissions: { isAdmin: (_s, _i, { session }) => session.role === 'admin' } )
//
//   export interface UserSession extends CoreUserSession {
//     userId: string
//     role?: string             // ← optional unless you added the admin() plugin
//     organizationId?: string   // ← the active org/team (organization() plugin)
//   }
//
//
import { addHTTPMiddleware } from '#pikku/middleware'
import { betterAuthStatelessSession } from '@pikku/better-auth'
import { authBearer } from '@pikku/core/middleware'

addHTTPMiddleware('*', [
  betterAuthStatelessSession({
    // ⚠️ mapSession runs on EVERY request — including sign-in/sign-up itself. If it
    // THROWS, every request 500s and NO ONE can sign in (the whole app looks dead).
    // So NEVER throw here and NEVER assume a field is present: read defensively and
    // default. A missing org/role means "not set yet", not "crash the request".
    // `result.user` is Better Auth's user row (plus plugin columns like `role`);
    // `result.session` carries the organization plugin's `activeOrganizationId`.
    mapSession: (result) => ({
      userId: result.user.id,
      role: (result.user as { role?: string }).role ?? undefined,
      organizationId:
        (result.session as { activeOrganizationId?: string }).activeOrganizationId ?? undefined,
    }),
  }),
  // Console bridge — carried over verbatim from the generated auth-middleware.gen.ts
  // that #754 removes when you register your own session above. Do NOT drop it, and do
  // NOT drop its `scopes`: the Fabric console/agent authenticate to the app with this
  // bearer token, and the console addon is gated on `pikku:console`. Without the grant
  // the token authenticates fine and then every console read 403s on a missing scope.
  authBearer({
    token: {
      secretId: 'PIKKU_CONSOLE_TOKEN',
      userSession: { userId: 'pikku-console-token', scopes: ['admin', 'pikku'] },
    },
  }),
])

//   addHTTPMiddleware('*', [
//     betterAuthStatelessSession({
//       mapSession: async (result, { kysely }) => {
//         const link = await kysely
//           .selectFrom('membership')
//           .select('tenantId')
//           .where('userId', '=', result.user.id)
//           .executeTakeFirst()            // may be undefined for a brand-new user
//         return { userId: result.user.id, tenantId: link?.tenantId }
//       },
//     }),
//   ])

//   func: async ({ kysely }, _input, { session }) => {
//     if (!session.warehouseId) return { totalSkus: 0, lowStockCount: 0 } // empty, no throw
//     // …scoped query only once the field is known present…
//   }
