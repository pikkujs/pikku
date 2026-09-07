---
'@pikku/addon-console': patch
'@pikku/addon-admin': patch
'@pikku/addon-graph': patch
---

Ship the generated `pikku-db-meta.gen.json` in `dist`. `pikku all` writes it
under `.pikku/addon/db/`, but `tsc` only emits the JSON it sees imported and
nothing imports this one, so it never reached the published package. Every
consumer running `pikku db generate` then failed with "does not publish
.pikku/db/pikku-db-meta.gen.json" — an addon that cannot say whether it ships
tables — which took out the `ai-postgres`, `remote-rpc-pg` and
`workflows-pg-boss` templates.
