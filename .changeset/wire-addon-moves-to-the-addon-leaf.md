---
'@pikku/addon-console': patch
'@pikku/inspector': patch
'@pikku/skills': patch
'@pikku/cli': patch
---

`wireAddon` and `wireRemoteAddon` move from `#pikku/function` to `#pikku/addon`.

Installing an addon and authoring one are the same concept from opposite ends,
so they are one import: an application's `#pikku/addon` carries the two install
functions, an addon package's carries `pikkuAddonConfig`, `pikkuAddonServices`,
`pikkuAddonWireServices` and `AddonBaseServices`.

Two generation fixes came with it:

- `CredentialsMap` is generated as a type alias rather than an interface. An
  interface has no implicit index signature, so it was never assignable to the
  `Record<string, unknown>` that `GetCredential` is constrained by, and every
  generated project reported two errors on its own function types.
- An unresolved `SingletonServices` type is now `PKU724` instead of a services
  map with no entries in it. Written out, the empty map made every service
  optional and the real failure resurfaced as unrelated "possibly undefined"
  errors in files nobody had touched.
