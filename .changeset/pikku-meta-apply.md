---
'@pikku/code-edit': patch
'@pikku/cli': patch
---

`pikku meta apply` edits your own source from a batch of operations, so an agent
that wants to set a permission, retag a function or rewrite a body no longer has
to regenerate the whole project once per property.

Three things had to exist for that to be safe:

`permissions` joins the function change-set. Unlike every field before it, its
value is an identifier rather than a literal, so the change-set carries the
module each symbol comes from and the missing import is spliced in — widening an
existing import from that module rather than adding a second one. The same
mechanism fixes `tools`, which has always emitted `ref(...)` without ever
importing `ref`.

`applyOperations` is all-or-nothing. Every operation resolves against in-memory
content first and nothing is written unless all of them succeed, so a batch
cannot leave a project half-edited and uncompilable with no record of how far it
got. Operations on one file compose in order, each re-parsing the last result,
because a splice invalidates every offset after it. A failure names the
operation that caused it.

Newly added properties no longer leave a blank line behind them, and a missing
trailing comma is now added after the last property instead of on its own line.
