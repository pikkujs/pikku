---
'@pikku/addon-changes-cli': patch
---

`pikku changes list` can be narrowed with `--status` (repeatable), `--specialist` and `--search`, and `--all` lifts the cap. The cap of 50 now applies to each column instead of the whole list, so a full ready column no longer hides the backlog, and a capped column says how many it is showing of how many.
