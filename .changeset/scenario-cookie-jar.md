---
'@pikku/core': patch
---

`createCookieJar` is now the one place a scenario keeps a session. `HttpScenarioActor` is built on it rather than tracking a single cookie string of its own, which means it follows a cookie the target rotates on any response — previously only the sign-in response was read, so a rotated session cookie was dropped and the only recovery was the 401 re-login.

It is exported from `@pikku/core/workflow` because a step driving a real auth client SDK needs the same thing an actor does.

Two fixes to what the jar holds. A `Set-Cookie` with an empty value is how a target **deletes** a cookie, so the name is now dropped rather than held with a value that says it is gone; and a `cookie` header the caller already set is merged with the jar's rather than silently replaced, which matters when the jar is handed to an SDK as its `customFetchImpl`.

`HttpScenarioActor` no longer reads `jar.empty` to decide whether it is signed in — it tracks the sign-in. `empty` is a fact about the jar, not about the session: a target that sets a CSRF or locale cookie before anyone signs in filled it, which made the actor skip its first `login()` and send that call unauthenticated, and made the "sign-in returned no session cookie" guard pass without a session ever being established. That guard now checks the sign-in response's own `Set-Cookie`.
