---
'@pikku/core': patch
---

Stop a redirect being answered with 204

A function that calls `response.redirect()` has nothing left to return, so it
returns `undefined` — and the HTTP runner read that as "no content" and
overwrote the 3xx with a 204. The `Location` header survived, but a browser
does not follow `Location` on a 204, so the redirect silently became a dead
end: the user sits on the page that sent them, waiting for a hop that never
comes. This is the whole OAuth/app-install callback shape, where the redirect
back to the app is the last step of the flow.

A void return now only becomes a 204 when the response is not already a
redirect. Every other status the runner assigns is unchanged.
