---
'create-pikku': patch
---

Scaffolding a Cloudflare template now keeps the `compatibility_date` the template pins, instead of rewriting it to the day you ran the command.

A compatibility date is a promise about a runtime that already exists. Stamping today's date on a fresh `wrangler.toml` asks workerd for behaviour it does not have yet: the binary bundled with the installed wrangler only supports dates up to the day it was released, so it refuses to boot with `This Worker requires compatibility date "…", but the newest date supported by this server binary is "…"`. Every new project was one wrangler release cycle away from a worker that would not start locally.

Both Cloudflare templates already pin a known-good date, and `@pikku/deploy-cloudflare` pins the same one for the workers it generates. The scaffolder now leaves that value alone; the app name substitution is unchanged.
