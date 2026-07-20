---
'@pikku/core': patch
'@pikku/inspector': patch
---

Stop silently dropping switch cases and spread returns from workflow graphs.

- A fall-through case (`case 'a': case 'b': ...`) recorded only the last value.
  A run entering on `'a'` therefore appeared to match no case at all. Empty
  clauses now carry through to the entry they fall into — the next non-empty
  case, otherwise `default`, otherwise the switch exit.
- `return { ...r, extra: 1 }` produced a return node listing only `extra`, so
  the graph claimed an output shape the workflow does not have, with no
  diagnostic. `return r` produced no return node at all. `ReturnStepMeta` now
  records a `spread` list, and the regenerated code emits it.
