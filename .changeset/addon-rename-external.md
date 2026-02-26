---
"@pikku/core": minor
"@pikku/cli": minor
"@pikku/inspector": minor
---

Rename 'external' to 'addon' throughout the codebase. All types, functions, config keys, and CLI options previously named `external` or `External` are now named `addon` or `Addon` (e.g. `ExternalPackageConfig` → `AddonConfig`, `externalPackages` → `addons`, `function-external` → `function-addon`).
