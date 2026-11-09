---
'@pikku/fetch': patch
'@pikku/react': patch
---

Server-sent events with `\r\n` or `\r` line endings now parse, including a `\r\n` split across two chunks. `postStream` sends its headers through `Headers`, so any form of header init works, and it stops yielding once the abort signal fires.
