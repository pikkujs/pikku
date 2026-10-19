---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

`wireRemoteAddon({ package: '@scope/name@^1.4.0' })` pins a remote addon by version range instead of a devDependency. The first step of `pikku all` resolves the range against the addon registry (`registry` in `pikku.config.json`, default `https://registry.pikkustudio.app`), verifies the SDK's sha512, extracts it to `.pikku/remote/<name>@<version>` and records it in the committed `pikku-addons.lock`. Codegen imports the remote addon's RPC, workflow and agent maps from the SDK, PKU338 checks the SDK against the lock, and `pikku update` reports versioned addons with the exact hand edit (file:line, old and new literal); it never rewrites source, and `--update` only touches package.json. New codes: PKU350 (package not a literal), PKU351 (SDK built for another @pikku/core), PKU352 (integrity mismatch), PKU353 (invalid package spec).
