---
'@pikku/addon-cloud-cli': patch
---

`pikku cloud git` shows where the linked project's repo lives, and `--move-to gitea|github|<url>` moves it, keeping stages, database, secrets and domains. A repo already on Cloud's git server moves into its team's git organization.
