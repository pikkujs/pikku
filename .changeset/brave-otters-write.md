---
'@pikku/skills': patch
---

Document the two frontmatter keys a driving loop writes, in `pikku-knowledge`.

`statusAt:` and `attempts:` are bookkeeping rather than content, and an agent
that rewrites a note has to know not to hand-edit them — clearing `attempts:`
hands back a budget that exists to stop a note nothing can satisfy being
rewritten forever.

Also corrects the status vocabulary: it is `designing` → `proposed` →
`dispatched` → `built`. The skill said `proposed` → `dispatched` → `built`,
"nothing else", while `validate` has always accepted `designing`.
