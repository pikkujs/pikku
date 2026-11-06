---
'@pikku/cli': patch
---

`pikku meta` answers what an agent used to read files for. New commands: `db [tables...]`, `screens`, `services`, `emails`, and `grep <terms...>`, which searches the whole project, translations included, and groups the matches by kind. Terms are word-aware and any can match. `pikku meta context` now prints a short map; `--json` or `--full` print the `meta-context.v1` document.
