---
'@pikku/addon-console': patch
---

When installing a second-or-later instance of the same addon package, the console now writes namespace-scoped `secretOverrides`/`variableOverrides`/`credentialOverrides` into the generated `wireAddon` so the two instances don't silently share one credential. The first (sole) instance stays plain and keeps the package's documented logical names. Overrides are a sensible default only — the generated file is the user's to edit or drop (the runtime and inspector both fall back to the logical name when an override is absent).
