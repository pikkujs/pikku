---
'@pikku/skills': minor
---

Skills now name the three languages a project has, and refuse to let them
collapse into one.

An agent building a doctor's portal for a German practice read "the entire UI is
German" as an instruction about the codebase. It shipped
`project.inlang/settings.json` with `baseLocale: "de"` and no `en.json` — which
broke `--add-locale` permanently — alongside RPC functions `getUebersicht` and
`getPatientendetail`, components `Zeitstrahl` and `AufmerksamkeitStreifen`, and
database tables `vorgang` and `ereignis`. Nothing in the skills had ever told it
these were three separate decisions, so it made one.

`pikku-concepts` now carries the canonical statement — identifiers are always
English and no setting changes that; meta (`description`, `title`, `template`)
follows `locale` in `pikku.config.json`; the product's UI language lives in the
message catalogue with `defaultLocale`, never in `baseLocale`. `pikku-build-app`
§1a asks the question and writes the answer into the config; `pikku-scenario`
splits step identifiers from step prose and admits where the English-only
reporter frame still shows through; `pikku-i18n` states why `baseLocale` stays
`en` and what to set instead. `pikku-build-quick`, `pikku-build-platform`,
`pikku-feature` and `pikku-fabric` carry the short form.
