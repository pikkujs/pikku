---
'@pikku/inspector': patch
'@pikku/cli': patch
---

fix(lint): don't flag pikkuAuth's session param as a non-destructured wire

`pikkuAuth`'s handler is `(services, session)` — the second parameter is the
resolved user session, not a wires bag. The inspector was extracting "wires"
from that parameter (`extractUsedWires(handler, 1)`), so a permission like
`pikkuAuth(async ({ logger }, session) => !!session)` tripped
`wiresNotDestructured` even though `session` cannot be destructured. pikkuAuth
exposes no user-facing wires parameter, so no wires meta is recorded for it.
