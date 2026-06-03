---
'@pikku/cli': patch
---

The `pikku fabric` command group gains `deploy plan` and `deploy apply` subcommands (replacing `--dry-run`), plus new read-only commands: `deploy list`, `deploy units`, `status`, `errors`, and `db schema`. `deploy apply` prompts for confirmation before deploying; `--auto-apply` skips it.
