---
'@pikku/node-http-server': patch
---

serve a built frontend's `/assets/*` before the content service claims the prefix

`LocalContent` defaults its asset prefix to `/assets`, which is also where Vite puts a
built bundle. Content ran first and answered every `GET /assets/*` itself, so once the
content service was always injected the frontend's own scripts 404'd. Static mounts now
get the request first; a miss still falls through to content, so signed asset URLs are
unaffected.
