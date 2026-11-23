---
'@pikku/cli': patch
---

`pikku all` no longer edits a project's `package.json`. When a generated file imports a package the project does not list, the command fails and names the package, the range this CLI was built against and the `package.json` to add it to.
