---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/playwright': patch
---

Personas can sign in through a project-supplied `PersonaSignIn`. `createHttpPersonas` accepts `signIn` (an instance, or a factory called per persona with `{ apiUrl, fetch, signInPath }`), exclusive with `secret` and `operator`. `scenarios.signIn` in `pikku.config.json` names a module exporting one, which `pikku scenario run`, `pikku persona run` and `pikku persona rpc` load and pass to the browser driver as `personaSignIn`.
