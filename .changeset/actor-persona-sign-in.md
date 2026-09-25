---
'@pikku/better-auth': patch
---

`pikkuActor` takes an optional `personaSignIn: { personas, allowed }`, which serves `POST /sign-in/persona { id }`: it signs in as a declared, runnable persona without the caller presenting a credential, so a "Sign in as" switcher on a deployed preview never ships an actor secret to the browser. `allowed` is asked on every call, and the actor sign-in gate still applies.
