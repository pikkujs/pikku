---
'@pikku/core': patch
'@pikku/inspector': patch
---

Fix CLI commands that come from an addon package. Auth and permissions set on such a command are now merged into the addon's own function instead of replacing it, and the command's input is shaped by the addon's own schema (for example a comma list becomes an array). The inspector now also resolves `...refCLI('addon:contract')`, spreads and `defineCLICommands` identifiers inside a command's `subcommands`.
