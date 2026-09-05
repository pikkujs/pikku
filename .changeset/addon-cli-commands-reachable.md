---
'@pikku/cli': patch
---

An addon can import `defineCLICommands` again. The whole `cli` leaf was retired for addons, so the helper the inspector explicitly permits — and that `refCLI` exists to mount on the consuming side — had nowhere to be imported from. The leaf now emits an addon-safe subset (`defineCLICommands`, `pikkuCLICommand`, `pikkuCLIRender`) and drops only `wireCLI`, the registry an addon genuinely cannot reach.
