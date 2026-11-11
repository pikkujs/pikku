---
'@pikku/cli': patch
---

`@pikku/cli/addon-support` no longer pulls a module with a top-level `await` into an addon's import graph: the CLI version is read synchronously. The Rust inspector evaluates addon schema files in QuickJS, where a shared top-level-await module deadlocked the second schema file reaching it and failed `pikku all` on `@pikku/addon-cloud-cli`.
