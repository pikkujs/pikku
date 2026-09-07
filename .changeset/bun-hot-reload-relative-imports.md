---
'@pikku/core': patch
---

Fix hot reload silently keeping old code on Bun for any file importing a relative sibling.

Inside a `pikku dev` that has been running for a while, Bun stops honouring `createRequire`'s referrer: a file importing `./sibling.js` reloads as `Cannot find module './sibling.js'` even though it resolves fine in a fresh Bun script, so the reload aborts and the process goes on serving the previous version of a function whose source has visibly changed. Bun's own resolver still answers correctly when handed the importer's directory outright, so the module runner now resolves each specifier to an absolute path before requiring it, and the referrer never has to survive the trip. Specifiers Bun's resolver declines — builtins among them — fall through unchanged, and non-Bun runtimes keep the plain `createRequire`.
