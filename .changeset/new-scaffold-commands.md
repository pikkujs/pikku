---
'@pikku/cli': patch
'pikku-vscode': patch
---

Add `pikku new` scaffold commands for bootstrapping project files:

- `pikku new function <name> --type func|sessionless|void`
- `pikku new wiring <name> --type http|channel|scheduler|queue|mcp|cli|trigger`
- `pikku new middleware <name> --type simple|factory`
- `pikku new permission <name> --type simple|factory`

Templates use correct `#pikku` imports and function signatures. VS Code extension now delegates to the CLI instead of using inline templates.
