---
'@pikku/openapi-parser': patch
---

A generated addon's errors now carry the upstream API's own message (`error.message`, `message`, `detail`, `title`), capped at 200 characters, instead of the raw response body with whatever debug data the API put in it.
