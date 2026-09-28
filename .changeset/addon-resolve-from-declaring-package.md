---
'@pikku/inspector': patch
'@pikku/cli': patch
---

An addon wired from a workspace package now resolves from that package. The installed-addon check (PKU340), the remote addon `devDependencies` check and `pikku db generate`'s addon schemas all looked only at the project root, so an addon declared where it is wired — the only place bun links it — failed codegen unless it was also declared at the root.
