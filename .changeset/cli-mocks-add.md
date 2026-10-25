---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku mocks add <rpc>` writes a mock in one step: it checks the RPC is a function of the project, writes `.mocks/<rpc.name>/<state>.json` and `<state>.meta.json` in the format `mocks diff`, `sync` and `check` read, keeps exactly one default, checks the body against the function's output, can declare the `--flag` in the project's flags file, and prints the stub hook call to use. It never overwrites a mock without `--force`.
