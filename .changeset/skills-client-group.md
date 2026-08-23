---
'@pikku/skills': patch
'@pikku/cli': patch
---

Add a `client` install group, so frontend-facing skills can be pulled without the whole `core` set: `pikku skills install --client`. `installGroups` has always been a list and the resolver installs a skill if *any* requested group matches, so `[core, client]` keeps every existing `--core` install identical.

Tagged `[core, client]`: `pikku-react`, `pikku-react-query`, `pikku-workflows-client`, `pikku-paraglide`, `pikku-i18n`, `pikku-rtl`.
