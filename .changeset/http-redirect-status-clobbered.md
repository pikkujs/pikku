---
'@pikku/core': patch
---

Stop the runner overwriting a status the route set

A function that calls `response.redirect()` has nothing left to return, so it
returns `undefined` — and the HTTP runner read that as "no content" and
overwrote the 3xx with a 204. The `Location` header survived, but a browser
does not follow `Location` on a 204, so the redirect silently became a dead
end: the user sits on the page that sent them, waiting for a hop that never
comes. This is the whole OAuth/app-install callback shape, where the redirect
back to the app is the last step of the flow.

The same clobber applied to a body: a route that set `201` and returned a
value was answered `200`.

The runner's 204 and 200 are now defaults rather than overrides — they apply
only when the route left the status alone.
