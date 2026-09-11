---
'@pikku/console': patch
---

Roles and the declared scope vocabulary are two top-level screens rather than
two tabs of one page: roles are composed at `/roles`, the vocabulary is read at
`/scopes`. A user row in the directory now opens that user's roles and scopes
on click, so what someone holds is one click from the list rather than behind a
per-row button.
