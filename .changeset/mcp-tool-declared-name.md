---
'@pikku/inspector': patch
---

Publish an MCP tool under its declared `name`

`pikkuMCPToolFunc`'s config accepts a `name`, and it is the name an AI client
calls the tool by, but the inspector never read it — the tool was always
published under whatever the export happened to be called. The declared name
now keys `toolsMeta`; `pikkuFuncId` is unchanged.
