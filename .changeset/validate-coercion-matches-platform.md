---
'@pikku/cli': patch
---

`pikku validate` no longer raises `coercion-map-not-wired` for an app that builds on `existingServices.kysely`. pikku dev, standalone deploys and Cloudflare deploys already apply the coercion map to that instance, and attaching `createCoercionPlugin` again double-parses json columns. The error now fires only when the app builds its own kysely (always the case on AWS Lambda and Azure, which hand over none), and its hint says so.
