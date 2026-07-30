---
'@pikku/skills': patch
'@pikku/cli': patch
---

Move the bundled agent skills out of `@pikku/cli` into a new MIT-licensed `@pikku/skills` package.

The skills are the open core — the instruction set any harness reads to build, wire and deploy a Pikku project — but they shipped inside `@pikku/cli`, whose `files` array carried `skills/` under BUSL-1.1 with no carve-out. Their terms now stand on their own package and no longer depend on the CLI that installs them.

This also fixes `pikku skills install` on the native binaries. `bun build --compile` only bundles the JS import graph, so 81 markdown files reached through `readdir` never made it in: every Homebrew install failed with `Could not locate bundled skills directory`, while npm installs worked. `@pikku/skills` ships both the `skills/` directory and an embedded path → contents manifest, and reads prefer the directory when one exists — so skill edits stay live in development, and the binary falls back to the manifest it now carries.

No skill content changed, and `pikku skills install` takes the same flags.
