---
'@pikku/cli': patch
---

`@pikku/cli` ships every snippet the docs need, so a site rendering them no longer
carries a submodule of the app they came from.

Three gaps closed against what the website was extracting itself: SQL migrations
are source too (`-- @snippet start` in a `.sql` file), `snippets-meta.json` records
which file each region came from so a page can link to it, and the scenario
environments block is read straight off the project's `pikku.config.json` — the one
region a marker cannot reach, since that file is parsed as strict JSON.
