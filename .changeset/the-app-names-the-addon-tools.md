---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

The app names which of an addon's functions reach MCP

`wireAddon`'s `mcp` takes a list as well as `true`. `true` still offers every
function the addon declared `mcp: true`; a list names the tools this deployment
offers, whether or not the addon declared them, and is typed against the
function names that addon publishes — a typo is a compile error rather than a
tool silently missing from the menu.
