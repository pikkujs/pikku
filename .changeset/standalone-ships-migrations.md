---
'@pikku/deploy-standalone': patch
'@pikku/cli': patch
---

A standalone artifact now carries its migrations: `db/<engine>` is copied beside the bundle (and the bun binary), where `db migrate` looks for them. Before, the artifact found none and reported an empty database as up to date. A bun standalone build of an app with a database also compiles again: the bundle's require shim declared the same `dirname` alias the entry imports.
