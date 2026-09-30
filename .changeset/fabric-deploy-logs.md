---
'@pikku/cli': patch
---

Add `pikku fabric deploy logs <deployment-id>` to read a deployment's build log on request (last 100 lines by default; `--tail <n>` or `--full`). A failed `deploy apply` no longer says "The builder recorded no reason" — the builder's output is stored apart from the deployment row, so that was untrue whenever the log existed. It now points at the new command.
