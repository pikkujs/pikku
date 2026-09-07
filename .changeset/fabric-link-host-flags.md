---
'@pikku/cli': patch
---

`pikku fabric link` can now start from a repo with no remote. `--github` and
`--gitea` name where the project lives; with no flag and no `origin` the CLI
asks before creating anything, and a non-interactive session is told which flag
to pass rather than being hung on a prompt.
