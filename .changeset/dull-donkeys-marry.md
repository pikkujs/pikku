---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Make the public surface an artifact the CLI produces.

`@pikku/cli` now ships `surface.json`, computed when the CLI is built by
generating one application and one addon and reading what each `#pikku/*` leaf
exports, plus a curated `@pikku/core` entry point for people building on the
ecosystem. Consumers resolve it as `@pikku/cli/surface.json`.

`pikku all` writes the matching per-project overlay to
`<outDir>/surface-usage.gen.json`: how often each export is imported and which
source areas it was seen in. The counting happens inside the sweep the inspector
already makes over every source file, so a prebuild pays no extra pass.
