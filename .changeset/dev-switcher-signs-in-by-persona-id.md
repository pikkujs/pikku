---
'@pikku/react': patch
'@pikku/mantine': patch
'@pikku/better-auth': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

The "Sign in as …" switcher no longer puts a credential in the frontend bundle. It lists personas from the app's `listDevActors` function and signs in by persona id through `POST /auth/sign-in/persona`, which `pikkuActor({ personaSignIn })` serves.

**Breaking (`@pikku/react`, `@pikku/mantine`):** `useDevActors` and `<DevActorSwitcher>` now take `{ list, apiUrl, onSignedIn }`. `list` is a call to the app's `listDevActors` RPC, e.g. `() => rpc.invoke('listDevActors', { app })`. The `actors` and `secrets` props are gone, and so are `parseDevActors`, `parseDevActorSecrets`, `signInAsActor` and `DevActorSecrets`. Actors are keyed by `id`, so `signInAs` takes an id and `pendingEmail` is now `pendingId`. `signInAsPersona({ apiUrl, id })` replaces `signInAsActor` for callers outside React.

`@pikku/better-auth` exports the server pieces: `listDevActors(personas, app?)`, which returns the personas the persona endpoint accepts (narrowed to `app` when it declares its own), and `devSwitcherOn(featureFlags, optIn)`, which is always on under `pikku dev` and on a deployed stage requires the actor sign-in opt-in plus the `devSwitcher` flag. Use the same `devSwitcherOn` call for the listing function and for `personaSignIn.allowed`.

`pikku dev` no longer mints `VITE_DEV_ACTOR_SECRETS`. The `app-missing-actor-quick-login-*` hint from `pikku fabric validate` now describes the persona-endpoint setup, and the check also accepts `signInAsPersona(` and `/auth/sign-in/persona`.
