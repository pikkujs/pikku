---
'@pikku/cli': patch
---

deploy: add `deploy.bundler` and `deploy.mangleIdentifiers` to pikku.config.json

`bundler` pins which bundler builds the deployment units — 'auto' (the
default) keeps today's behaviour of Bun.build under bun and esbuild
otherwise, and 'esbuild' forces esbuild where a Bun.build output misbehaves
at runtime. A Cloudflare MCP worker was rejected at upload with
`TypeError: ZodLazy is not a constructor`: Bun.build ordered zod's lazy
module initializer after a dependency that constructs schemas at module
scope. The same entry bundles and boots correctly with esbuild.

`mangleIdentifiers: false` turns off identifier renaming, so a platform that
reports only a message and a line/column into a minified bundle names
something the project can search for.
