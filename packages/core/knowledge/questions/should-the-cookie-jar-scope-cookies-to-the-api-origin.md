---
type: question
title: Should the scenario cookie jar scope cookies to the API origin?
description: createCookieJar sends every held cookie to whatever URL it is given, keeps only name and value from Set-Cookie, and stamps the API origin on all calls
tags: core, scenario, cookies
---

# Should the scenario cookie jar scope cookies to the API origin?

`createCookieJar` in `packages/core/src/services/scenario-cookie-jar.ts`
takes one `apiUrl` and reads its origin once. Its `fetch` ignores the host of
`input`. It sets the `Origin` header to that origin on every call, and it adds
every held cookie to every call whatever URL the call goes to.

From `Set-Cookie` it keeps only the `name=value` pair. `Path`, `Domain`,
`Secure`, `Max-Age` and `Expires` are discarded. A cookie is removed only when its
value is empty, so `session=x; Max-Age=0` would be stored as a live cookie.

The tests in `scenario-cookie-jar.test.ts` send every request to one local
server, so none of this is exercised. The `Origin` stamp is tested on purpose
("stamps the origin Better Auth checks on state-changing calls").

What is asked: is the jar meant only to talk to its own API, in which case the
cross-host behaviour does not matter, or should it honour cookie scope? The code
does not say, and the browser-side equivalent in `packages/playwright/src/provider.ts`
plants cookies on `appUrl` instead.
