//~ name: wire-scope
//~ title: Scopes — coarse capability gates (defineScope tree + grant in mapSession + gate a function)
//~ when: The app has CAPABILITIES that only some users may exercise — admin-only actions, "can void an invoice", "can manage members", a billing-manager tier. Scopes are the RIGHT tool for a role/capability AND-gate; `permissions` (pikku-permissions) is for per-request OWNERSHIP/data predicates (is this MY row, my org). Use BOTH: a scope says "may this KIND of user do this at all", a permission says "may they touch THIS record". Lay this down when roles first appear; pull `auth-session` too (scopes are granted there) and `feature-flags` (the client surface — without it the UI looks identical for every role).
//~ lang: ts
//~ steps:
//~ SCOPES vs PERMISSIONS — pick the right one:
//~  • scopes:   AND gate, checked BEFORE permissions, depend ONLY on the session,
//~              can only NARROW access. "Is this user allowed this capability at all?"
//~              Declared here, granted in mapSession, required on a function as
//~              `scopes: ['admin:invoices:void']`.
//~  • permissions: OR groups evaluated against the request DATA (ownership, org match).
//~              "Does this specific record belong to them?" See pikku-permissions.
//~
//~ ⚠️ FAIL-CLOSED — THE ONE RULE YOU MUST NOT BREAK. `verifyScopes` runs the moment a
//~ function declares `scopes`, whether or not anyone was granted them. A session whose
//~ `scopes` does NOT include the required id (or a parent / `*`) is DENIED with
//~ MissingScopeError. So: NEVER put `scopes: [...]` on a function unless mapSession
//~ (STEP 2) actually grants that scope to the users who should pass — otherwise the
//~ function 403s EVERYONE, including the admin. Grant first, gate second.
//~
//~ STEP 1 — DECLARE the vocabulary. `defineScope` is a no-op the CLI AST-reads to
//~ generate a typed `ScopeId` union, so a function requiring an undeclared scope is a
//~ COMPILE error. Scopes nest by segment and join with ':' — the tree below yields
//~ `admin`, `admin:invoices`, `admin:invoices:void`, `admin:members`, `billing`.
//~ Holding a PARENT grants everything beneath it (`admin` covers `admin:invoices:void`);
//~ `*` grants all. Keep it small and semantic — one node per real capability, not per route.
//~
//~ STEP 2 — GRANT scopes to a session in mapSession (see the `auth-session` scaffold).
//~ mapSession sets `session.scopes` and it is AUTHORITATIVE — no ScopeService needed for
//~ a role-driven app. Derive scopes from the user's role; admins hold everything via `*`.
//~ The first commented block below is the shape: it goes in your session middleware (the
//~ file the `auth-session` scaffold has you create,
//~ packages/functions/src/middleware/session.middleware.ts), inside
//~ betterAuthStatelessSession. A DB-backed grant model — per-user grants, a console grant
//~ UI — is a ScopeService; that is beyond an app scaffold. For generated apps, resolve
//~ scopes from role there.
//~
//~ STEP 3 — REQUIRE the scope on the capability. Add `scopes: [...]` to the pikkuFunc
//~ that performs the privileged action (NOT in the func body — same discipline as
//~ permissions). Combine with a `permissions` ownership check where the action also
//~ touches a specific record — the second commented block below shows both gates on one
//~ function. A read/list function that everyone may see needs NO scope — leave it
//~ ungated. Only gate the genuinely privileged writes/actions; over-gating is how a fresh
//~ app locks its own admin out. Test the DENY path with the `scenario-permissions` scaffold.
//~
//~ STEP 4 — GIVE THE FRONTEND SOMETHING TO READ: `pikku examples add --name feature-flags`.
//~ Steps 1–3 secure the SERVER and change nothing on screen — scopes never cross the
//~ wire, so without this step every role sees an identical UI and the roles you just
//~ built are invisible. That is the #1 way a role-based app ships looking like it has
//~ no roles at all. The `feature-flags` recipe adds one `getFeatures` RPC that maps
//~ scopes to UI-facing feature names the client can hide/show on.
//~ ⚠️ It HIDES, it does not protect: keep the `scopes: [...]` from STEP 3 on every
//~ function whose control you hide. Hide AND gate — a hidden button with an ungated
//~ RPC is an app that only LOOKS secure.
import { defineScope } from '#pikku/scopes'

defineScope({
  admin: {
    displayName: 'Administration',
    description: 'Administrative capabilities',
    scopes: {
      invoices: {
        description: 'Manage invoices',
        scopes: {
          void: { description: 'Void an invoice' },
        },
      },
      members: { description: 'Manage members' },
    },
  },
  billing: { displayName: 'Billing', description: 'View and manage billing' },
})

//
//   // in your session middleware (the file the `auth-session` scaffold has you create,
//   // packages/functions/src/middleware/session.middleware.ts), inside betterAuthStatelessSession:
//   mapSession: (result) => {
//     const role = (result.user as { role?: string }).role
//     return {
//       userId: result.user.id,
//       role,
//       // '*' grants every scope; a finance user gets only what they need.
//       scopes:
//         role === 'admin' ? ['*']
//         : role === 'finance' ? ['admin:invoices', 'billing']
//         : [],
//     }
//   }
//

//
//   export const voidInvoice = pikkuFunc({
//     // coarse gate: only an invoice-voider may call this at all …
//     scopes: ['admin:invoices:void'],
//     // … fine gate: and only for an invoice in their own org.
//     permissions: { orgMatch: canAccessOrgByInvoiceId },
//     input: z.object({ invoiceId: z.string() }),
//     output: z.object({ voided: z.boolean() }),
//     func: async ({ kysely }, { invoiceId }) => {
//       await kysely.updateTable('invoice').set({ status: 'void' }).where('invoiceId', '=', invoiceId).execute()
//       return { voided: true }
//     },
//   })
//
