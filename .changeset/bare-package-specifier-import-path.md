---
'@pikku/cli': patch
---

Stop `getFileImportRelativePath` doing path arithmetic on bare package specifiers. The bootstrap zero state records core's types as `typePath: '@pikku/core'` — already an import specifier, where every other producer of that field supplies a file on disk — so relativising it produced `../../@pikku/core`: a directory that does not exist, extensionless, which `nodenext` then refuses to resolve (TS2834). The existing node_modules branch could not catch these, having no `node_modules/` in the string to key off. A `to` that starts with neither `.`, `/` nor a drive letter is now returned unchanged.
