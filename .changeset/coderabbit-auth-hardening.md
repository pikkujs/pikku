---
"@pikku/core": patch
"@pikku/cli": patch
"@pikku/inspector": patch
"@pikku/aws-services": patch
"@pikku/console": patch
---

fix: address Better Auth review findings (secret/variable batch typing, auth init, guards)

- **core**: `SecretService.getSecrets` / `VariablesService.getVariables` (and the
  Local/Typed/Scoped/AWS implementations) now return `Partial<T>`, honestly
  reflecting that missing keys are omitted at runtime rather than typing partial
  data as fully populated. `ScopedSecretService.getSecrets` now throws on a
  disallowed key instead of silently filtering it out. `getAuthRegistry` /
  `setAuthRegistry` return and store defensive copies so consumers can't mutate
  global auth state.
- **cli**: the generated `services.auth()` thunk clears its memoised promise on
  rejection, so a transient Better Auth/Kysely startup failure no longer
  permanently poisons auth for the process lifetime.
- **inspector**: the `pikkuBetterAuth` export guard now requires an exported
  `const` (rejects `export let`/`export var`), matching its error message.
- **console**: the Microsoft auth provider's `callbackId` is `microsoft` (the
  Better Auth provider id) rather than `microsoft-entra-id`.
