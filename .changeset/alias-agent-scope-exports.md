---
'@pikku/cli': patch
---

`#pikku/agent` now exports `AgentInput` and `AgentStreamEvent`, and `#pikku/scopes` exports `hasScopes` and `declareScopes`. `pikku validate` already told apps to import these through the alias instead of `@pikku/core/agent` and `@pikku/core/scope`, but the generated modules did not carry them, so following the hint failed to compile.
