---
'@pikku/inspector': patch
---

Resolve `Config`, `SingletonServices` and `Services` by declaration rather than
by name.

Service extraction read `typesLookup` under the hardcoded names the scaffold
happens to use, but the lookup is keyed by whatever the project named its
interface. A project that renamed one satisfied every required-type check and
then resolved to no services at all, surfacing much later as PKU724 or as every
singleton service turning optional. These now go through the import maps, which
carry the real name, and `getFilesAndMethods` already rejects a second
declaration — so the one it finds is the only one.
