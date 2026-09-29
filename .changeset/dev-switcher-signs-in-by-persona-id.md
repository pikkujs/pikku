---
'@pikku/react': patch
'@pikku/mantine': patch
'@pikku/better-auth': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

The "Sign in as …" switcher no longer puts a credential in the frontend bundle. It lists personas from `GET /auth/sign-in/personas` and signs in by persona id through `POST /auth/sign-in/persona`; `pikkuActor({ personaSignIn })` serves both, so the app writes no listing function.

**Breaking (`@pikku/react`, `@pikku/mantine`):** `useDevActors` and `<DevActorSwitcher>` now take `{ apiUrl, app?, onSignedIn }`. The `actors` and `secrets` props are gone, and so are `parseDevActors`, `parseDevActorSecrets`, `signInAsActor` and `DevActorSecrets`. Actors are keyed by `id`, so `signInAs` takes an id and `pendingEmail` is now `pendingId`. `signInAsPersona({ apiUrl, id })` replaces `signInAsActor`, and `listDevActors({ apiUrl, app })` fetches the list, for callers outside React.

`@pikku/better-auth`: `personaSignIn` now also serves `GET /sign-in/personas?app=`, listing exactly the personas `/sign-in/persona` accepts (narrowed to `app` when it declares its own), or none when the gate is shut. `allowed` is now optional: pass `personaSignIn: { personas, featureFlags }` and both endpoints are open under `pikku dev`, and on a deployed stage only with `allowSignIn` opted in and the `devSwitcher` flag on. `devSwitcherOn(featureFlags, optIn)` exports that same check.

`pikku dev` no longer mints `VITE_DEV_ACTOR_SECRETS`. The `app-missing-actor-quick-login-*` hint from `pikku fabric validate` now describes the persona-endpoint setup, and the check also accepts `signInAsPersona(` and `/auth/sign-in/persona`.
