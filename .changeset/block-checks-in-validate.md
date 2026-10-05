---
'@pikku/cli': patch
'@pikku/inspector': patch
---

`pikku validate` checks block libraries. The project's `pikku.config.json` lists them by package name under `blocks`; each listed package's `src/blocks` is checked. A block that renders a literal string is an error, because its words have to come from messages, and a block with no `.stories.tsx` is a warning. A block with no errors is reported as productized. A listed name that matches no package, or a package with no `src/blocks`, is an error.
