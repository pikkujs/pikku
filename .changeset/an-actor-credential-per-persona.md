---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/better-auth': patch
'@pikku/react': patch
'@pikku/mantine': patch
'@pikku/playwright': patch
'@pikku/skills': patch
---

An actor credential is one persona's, not everyone's

`SCENARIO_ACTOR_SECRET` was a skeleton key. Anyone holding it could post any
`actor: true` address to `/auth/sign-in/actor` and get that persona's session —
including the `admin` persona, which provisioning grants real admin. The browser
switcher held it too, baked into the dev bundle as `VITE_SCENARIO_ACTOR_SECRET`,
so "the reviewer can sign in as each kind of user" and "the reviewer's bundle is
entitled to every persona" were the same fact.

It is now a root that credentials derive from, never one that is presented:

```ts
deriveActorSecret(root, email) // HKDF-expanded HMAC-SHA256 over the address
```

The endpoint re-derives the expected value for whichever address is signing in
and compares, so nothing is stored or looked up, a credential minted for one
persona is refused for every other, and rotating the root invalidates all of
them at once. The root itself is no longer a valid credential, and a root under
32 characters refuses the endpoint rather than deriving weak credentials from
it — the server log says why, the client is not told.

What that buys, in the places that used to need the whole key:

- **`pikku dev`** mints one credential per declared persona into
  `VITE_DEV_ACTOR_SECRETS` and no longer writes `VITE_SCENARIO_ACTOR_SECRET` at
  all. The root stays on the server.
- **`pikku persona secret <id>`** mints them for anything else, and a run given
  `PIKKU_PERSONA_SECRETS=id=secret,…` can sign in as those personas and no
  others — asking for one outside the list throws naming the persona instead of
  falling back to the root.

`useDevActors()` and `<DevActorSwitcher />` take `secrets` (one per address)
where they took `secret`, and an actor with no credential is no longer offered
rather than rendering a row that 401s. `HttpPersonasConfig.secret` and the
Playwright provider's `secret` additionally accept a resolver, which is how a
partially-credentialled run is expressed.
