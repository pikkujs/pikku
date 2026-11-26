---
'@pikku/cli': patch
---

A package that ships services without being an addon (it exports `./.pikku/services/*` and no bootstrap) can be opted into with `wireAddon({ services })`: the generated bootstrap no longer imports a file the package does not have.
