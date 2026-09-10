---
'@pikku/cli': patch
---

A fabric refusal reads as an instruction, not a crash. `pikku fabric deploy apply` and `pikku fabric logs` raised their preconditions — a branch out of sync with its remote, a detached HEAD, a dirty tree at link time, a missing `--branch`, a non-interactive deploy without `--auto-approve` — as plain `Error`s, so the CLI printed ten frames of `@pikku/core` function-runner and cli-runner internals in front of the one sentence that says what to do about it.

They now throw `FabricPreconditionError`, a `PikkuError` — the marker the CLI already uses to decide that a message is the whole output (`PikkuTypecheckFailedError`, `PikkuDeployBuildFailedError` and the persona commands do the same). The message and the non-zero exit are unchanged, and `--verbose` / `PIKKU_DEBUG` still shows the stack.
