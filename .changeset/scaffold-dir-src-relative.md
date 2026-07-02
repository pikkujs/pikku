---
'@pikku/cli': patch
---

fix(cli): default the scaffold directory beside `srcDirectories[0]` (e.g.
`packages/functions/src/scaffold`) instead of the rootDir-relative
`src/scaffold`. In a monorepo the old default silently mis-placed generated
scaffold files (auth.gen.ts, auth-secrets.gen.ts) at the repo root where their
imports — e.g. `zod` — don't resolve, causing PKU489. Single-package layouts
(`srcDirectories: ["./src"]`) are unaffected: the derived default is still
`src/scaffold`. Set `scaffold.pikkuDir` explicitly to override.
