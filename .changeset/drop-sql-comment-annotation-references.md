---
'@pikku/inspector': patch
---

The PKU910 sessionless-output diagnostic advised marking a column `@public`, a
SQL-comment annotation syntax that no longer exists. Column classification is
sourced solely from the hand-authored `db/annotations.ts`, so the message now
points there.
