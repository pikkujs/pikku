---
'@pikku/cli': patch
---

`pikku addons add` lists what each add-on will be allowed to use ("mail can use stripe") and asks before keeping the install. `--yes` / `-y` skips the question, a run with no terminal and no `--yes` refuses, and `--dry-run` prints the list and undoes everything.
