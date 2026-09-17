---
'@pikku/cli': patch
'@pikku/core': patch
---

A pikku command never ends in a node internals warning, and a secret can be set from a script.

`pikku fabric secrets set NAME` prompted for the value through readline in terminal mode. On a stdin that is not a tty that promise never settles at all, so the command printed `BETTER_AUTH_SECRET value:` and then node's "Detected unsettled top-level await", naming a line of `@pikku/cli`'s own bin — under bun it simply hung. The prompt now reads the first line of stdin when there is no tty, so `echo '<value>' | pikku fabric secrets set NAME` works, and refuses with the flag to reach for (`--value`) when stdin is closed or empty. `promptConfirm` gained the same backstop, so a caller that forgets its `isTTY` gate gets a refusal instead of a hang.

Alongside it, the places a raw stack could still reach a user:

- The `pikku` binary formats through `formatCLIError` instead of printing `error.message`, and installs `uncaughtException` / `unhandledRejection` handlers so nothing escaping a listener or a floating promise is dumped unformatted. A `CLIError` the runner already printed is no longer printed twice.
- The generated local and channel CLI bootstraps do the same, rather than `console.error('Fatal error:', error.message)` — which dropped the stack even when one was asked for.
- A missing `pikku.config.json` says where it looked and what to do, as a `PikkuCLIConfigError`, which is now a `PikkuError` along with `GitError` and every remaining plain `Error` raised by a `pikku fabric` command. A directory-wide test keeps it that way.
- `pikku dev`'s watcher and the MCP schema loader log their causes through the logger at debug level instead of `console.error(err)` over the top of the output.

Stacks are unchanged where they are the answer: an unexpected error still keeps its frames, and `--verbose` / `PIKKU_DEBUG` still prints the stack for a deliberate one. `formatCLIError` and `wantsStackTrace` are exported from `@pikku/core/cli` so every entrypoint that can be the last thing to catch an error prints it the same way.
