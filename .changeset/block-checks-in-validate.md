---
'@pikku/cli': patch
'@pikku/inspector': patch
---

`pikku validate` checks the blocks of a project. Wherever a package has `src/blocks`, a block that renders a literal string is an error, because its words have to come from messages, and a block with no `.stories.tsx` is a warning. A block with no errors is reported as productized.
