---
'@pikku/knowledge': patch
'@pikku/deploy-standalone': patch
---

A knowledge note can cite a stored file as `content:bucket/key`, checked against the project's local content directory. `StandaloneProviderAdapter` takes a `port` option that sets the default `PORT` of the generated entry and its `.env.example`.
