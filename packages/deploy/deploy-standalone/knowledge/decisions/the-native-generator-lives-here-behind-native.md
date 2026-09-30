---
type: decision
title: The native project generator lives here, behind `./native`
description: Tauri project generation, sync and check stay in @pikku/deploy-standalone and are exported from its `./native` subpath; the CLI's `pikku app native` commands only read config and call it
tags: [tauri, native, packaging]
---

# The native project generator lives here, behind `./native`

`pikku app native init|add|upgrade|check` live in the CLI, but the code that
writes and inspects a `src-tauri/` project — `createNativeProject`,
`syncNativeProject`, `checkNativeProject`, the Rust templates, the plugin
catalogue and the identifier rules — stays in this package and is exported from
`@pikku/deploy-standalone/native`.

It stayed because the sidecar mode is the one place a deploy and a native
project meet: the standalone adapter compiles the server and installs it as the
shell's `externalBin`, under the same `pikku-server` name the generated Rust
spawns. Splitting the generator from the adapter would put the two ends of that
contract in different packages, with the name duplicated between them.

The subpath keeps the CLI's import narrow. `pikku app native` pulls in file
templates and pure functions, not the deploy adapter and its bundler.

The CLI side owns everything about the config: reading `frontends.<name>.native`,
defaulting the identifier from the root package's scope, refusing a clash
between two apps, and writing the entry back. This package receives a resolved
`NativeProjectSpec` and never reads `pikku.config.json`.

**What this rules out:** a separate `@pikku/native` package for now, and the
generator reading config on its own.
