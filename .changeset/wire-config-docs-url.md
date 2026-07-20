---
'@pikku/inspector': patch
'@pikku/core': patch
---

Add an optional `docsUrl` to `wireSecret`, `wireVariable`, and `wireCredential`, so a console or deploy UI reporting a missing value can link the user to where they obtain it instead of showing a bare identifier.
