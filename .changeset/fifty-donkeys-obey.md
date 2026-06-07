---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Normalize reusable addon contract metadata across HTTP, CLI, and channels so addons can export `defineHTTPRoutes`, `defineCLICommands`, and `defineChannelRoutes` contracts that the inspector resolves and the CLI emits as contract metadata for consumers to wire directly from packaged metadata.
