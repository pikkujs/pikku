---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
---

Licence change: `@pikku/cli`, `@pikku/inspector` and `@pikku/inspector-go` move from the Business Source License 1.1 to AGPL-3.0-only (the Rust inspector, not published, too). Every other package stays MIT. Versions published before this release keep the BUSL-1.1 terms they shipped with. Code the CLI generates into your project is not meant to be covered by the AGPL (draft wording pending legal review, see LICENSE). Other licensing is available: see LICENSE-COMMERCIAL.md. Details in docs/MIGRATION.md.
