---
'@pikku/core': patch
---

Remove the `addMiddleware` alias of `addTagMiddleware`.

The CLI inspector decides what registers tag middleware by matching the call's
identifier text, so `addMiddleware(...)` compiled, exported and registered
nothing — no error, no warning, and the middleware simply never ran. The name
was also the one the concept-mapping skill taught.

`addTagMiddleware` is the newer name and the scope-matched sibling of
`addGlobalMiddleware`; the alias was reintroduced after the rename that
established that pair.
