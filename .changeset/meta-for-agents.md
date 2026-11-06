---
'@pikku/cli': patch
---

`pikku meta` answers what an agent used to read files for. New commands: `db [tables...]`, `screens`, `services`, `emails`, and `grep <terms...>`, which searches the whole project, translations included, and groups the matches by kind. Terms are word-aware and any can match. `pikku meta context` now prints a short map; `--json` or `--full` print the `meta-context.v1` document. It also carries what an agent otherwise read files to learn, all read from the project and silent for what it lacks: agents, model aliases and where to add one, the agent runner with its providers and env names, translation locales, source, import and key shape, the generated client's import, and where routes, pages, the shell, nav and UI components are.
