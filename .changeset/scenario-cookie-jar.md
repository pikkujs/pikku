---
'@pikku/core': patch
---

`createCookieJar` is now the one place a scenario keeps a session. `HttpScenarioActor` is built on it rather than tracking a single cookie string of its own, which means it follows a cookie the target rotates on any response — previously only the sign-in response was read, so a rotated session cookie was dropped and the only recovery was the 401 re-login.

It is exported from `@pikku/core/workflow` because a step driving a real auth client SDK needs the same thing an actor does.
