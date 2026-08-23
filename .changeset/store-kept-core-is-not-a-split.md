---
'@pikku/cli': patch
---

PKU717 no longer fires on a version bun or pnpm left in its store. Neither prunes
on upgrade, so one `@pikku/core` bump leaves both copies on disk while the links
resolve to one — and the guard reported a split on a tree that had none. The scan
now walks in from the `@pikku/*` links, so a store copy counts only when
something actually resolves to it.
