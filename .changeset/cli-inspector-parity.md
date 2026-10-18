---
'@pikku/cli': patch
---

`pikku inspector parity` runs the project's codegen with the TypeScript inspector and then the native one, from the same generated state, and fails unless both save the same inspector state, generate the same files and log the same diagnostics.
