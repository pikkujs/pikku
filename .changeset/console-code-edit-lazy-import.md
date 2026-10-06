---
'@pikku/addon-console': patch
---

The console add-on's lazy `@pikku/code-edit` import no longer breaks standalone bundles. The specifier was a constant the bundler folded back into a literal, so any app bundling the console failed to load when `@pikku/code-edit` was not installed.
