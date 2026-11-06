---
'@pikku/inspector-go': patch
---

Fix Cloudflare Workers apps crashing at startup: `@pikku/inspector-go` read `import.meta.url` when the module loaded, which a Workers bundle does not have. The package paths are now resolved when the binary is first used.
