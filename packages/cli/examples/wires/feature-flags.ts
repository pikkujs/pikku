//~ name: feature-flags
//~ title: Feature flags — one `getFeatures` RPC the frontend uses to show/hide screens
//~ when: The app has ROLES and the UI must differ between them — hide a nav item, skip a page, drop a button. Pull this the moment you pull `wire-scope`: scopes gate the SERVER, this is the matching CLIENT surface, and without it every role sees the same screen. Needs `wire-scope` (declares the scopes) + `auth-session` (grants them in mapSession).
//~ lang: ts
//~ steps:
//~ ⚠️ A FEATURE HIDES UI. IT NEVER PROTECTS ANYTHING.
//~ Hiding a button behind a feature while leaving `scopes:` off the function is the
//~ ONE failure this scaffold can cause: the app LOOKS gated, every screenshot and
//~ scenario passes, and the RPC still answers anyone who calls it directly. The
//~ guarantee is ALWAYS the function's own `scopes: [...]` (see `wire-scope` STEP 3).
//~ Rule: every feature you hide a control behind must ALSO have the scope on the
//~ function that control calls. Hide AND gate — never one or the other.
//~
//~ WHY NOT JUST SEND `session.scopes` TO THE CLIENT? Because then every screen learns
//~ the capability vocabulary, a scope rename becomes a frontend refactor, and each
//~ call site has to re-implement parent/wildcard resolution (`admin` covers
//~ `admin:invoices:void`) — which someone will get wrong in the PERMISSIVE direction.
//~ A feature is a UI-facing NAME; the scopes behind it stay a server concern.
//~
//~ STEP 1 — MAP each feature to the scopes that satisfy it, in
//~ packages/functions/src/lib/features.ts. `ScopeId` is generated from your
//~ `defineScope` tree (run `pikku all` after declaring it), so a typo'd scope is a
//~ COMPILE error rather than a silently-always-false feature.
//~ Semantics are OR: holding ANY listed scope turns the feature on — a flag usually
//~ reveals one entry point that several roles can reach.
//~ An EMPTY array means visible to EVERYONE — `hasScopes([], …)` is satisfied by
//~ anything, which is the correct reading of "this feature requires no capability".
//~ Use it for a feature every signed-in user gets. It does NOT mean "nobody yet";
//~ for that, omit the feature entirely.
//~ ⚠️ The `ScopeId` import below is the GENERATED scopes file, NOT `#pikku`. Before you
//~ declare a `defineScope` tree, `ScopeId` is `never` — so every entry in FEATURES is a
//~ type error until STEP 1 of `wire-scope` exists. That is the right order: declare
//~ scopes, `pikku all`, then map features onto them.
//~
//~ STEP 2 — EXPOSE them as one RPC, in
//~ packages/functions/src/functions/get-features.function.ts. Shaped exactly like the
//~ template's `getSession` (readonly, auth'd, no input) so the client fetches it once
//~ on load beside the session.
//~ `hasScopes` is pikku's own non-throwing checker — it understands parent grants and
//~ `*`, which is precisely the logic the frontend must never re-implement.
//~ List every feature explicitly in the output schema — do NOT build it from
//~ Object.keys(). The generated client type comes from THAT object, so spelling the
//~ keys out is what makes `features.calList` a compile error on the frontend instead of
//~ `undefined` (which reads as false, hides the feature forever, and leaves every test
//~ green). Adding a feature therefore touches three places: FEATURES, the output
//~ schema, and the returned object. The compiler enforces the last two against each
//~ other.
//~
//~ STEP 3 — CONSUME it on the client. Fetch once and gate nav + routes off it. The
//~ type comes from the generated client — NEVER hand-write a Features interface. The
//~ first commented block below is the hook and the hidden nav item.
//~ ⚠️ WHILE `features` IS UNDEFINED, RENDER NOTHING — not the feature. `features?.x`
//~ is undefined on the first paint, so `{!features?.x && <Locked/>}` flashes a locked
//~ state at the very users who DO have access. Gate on the positive, as shown.
//~ AND GUARD THE ROUTE, not just the link. A hidden nav item is still reachable by
//~ typing the URL; without a route guard the page renders and its RPCs 403, which
//~ looks broken rather than absent — the last commented line below is that guard.
//~
//~ STEP 4 — PROVE IT WITH A SCENARIO. Each persona should see its OWN feature set;
//~ that is the regression test for this whole file, and it is what catches a feature
//~ that silently went all-false because a scope was renamed. Drive it per-actor with
//~ the `scenario-permissions` scaffold: assert the counter sees `takeInBike` and the
//~ mechanic does not, then assert the DENIED path (`scenario.expectError`) on the
//~ function itself — which is what proves the `scopes:` gate is really there and you
//~ did not merely hide the button.
import type { ScopeId } from '#pikku/scopes/pikku-scopes.gen.js'

export const FEATURES = {
  takeInBike: ['bikes:intake'],
  workStand: ['bikes:repair'],
  callList: ['bikes:intake', 'shop:admin'],
} as const satisfies Record<string, readonly ScopeId[]>

export type FeatureId = keyof typeof FEATURES

import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { hasScopes } from '@pikku/core/scope'

export const GetFeaturesOutput = z.object({
  takeInBike: z.boolean(),
  workStand: z.boolean(),
  callList: z.boolean(),
})

export const getFeatures = pikkuFunc({
  expose: true,
  readonly: true,
  auth: true,
  description: 'Which features the signed-in user may see. UI only — never a gate.',
  input: z.object({}),
  output: GetFeaturesOutput,
  func: async (_services, _input, { session }) => {
    const can = (feature: FeatureId) =>
      FEATURES[feature].some((scope) => hasScopes([scope], session?.scopes))

    return {
      takeInBike: can('takeInBike'),
      workStand: can('workStand'),
      callList: can('callList'),
    }
  },
})

//
//   // apps/app/src/lib/useFeatures.ts
//   import { useQuery } from '@tanstack/react-query'
//   import type { GetFeaturesOutput } from '@<app>/sdk/pikku/rpc-map.gen'
//
//   export const useFeatures = () => {
//     const { data } = useQuery({
//       queryKey: ['features'],
//       queryFn: () => pikku.invoke('getFeatures', {}),
//       staleTime: Infinity,          // refetches on reload / re-login, which is enough
//     })
//     return data
//   }
//
//   // hiding a nav item
//   const features = useFeatures()
//   {features?.callList && <NavLink to="/call-list" label={m.nav__call_list()} />}
//
//
//
//   if (features && !features.workStand) return <Navigate to="/" replace />
//
