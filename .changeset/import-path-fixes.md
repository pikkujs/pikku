---
'@pikku/cli': patch
---

Fix import path generation to handle same-package files and node_modules paths

- When files are in the same package directory, skip packageMappings and use relative paths
- When import paths include node_modules, strip everything before and including node_modules/ for cleaner imports
- This prevents issues where files within the same package would incorrectly reference themselves via package names
- Transforms ugly paths like `../../../../node_modules/@pikku/core/dist/types/core.types.d.js` into clean paths like `@pikku/core/dist/types/core.types.d.js`
