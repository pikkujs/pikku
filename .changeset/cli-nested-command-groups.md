---
"@pikku/core": patch
"@pikku/cli": patch
---

Fix nested CLI subcommands: a command group that has subcommands but no function of its own now prints its subcommand help and exits non-zero, instead of falling through into execution. Nest the fabric `secrets` and `domains` commands into groups — `secrets set|list` and `domains list|add|remove` (previously `secretsSet`/`secretsList`/`domainsList`/`domainsAdd`/`domainsRemove`). Regroup `deploy` into `deploy plan` and `deploy apply` (replacing `deploy --dry-run`); the subcommand now carries the plan-vs-apply intent. `deploy apply` prompts for a classic yes/no confirmation before deploying — `--auto-apply` skips it, and a non-interactive session refuses (re-run with `--auto-apply`) rather than hang.

CLI option flags now render in kebab-case in help and error messages (`--auto-apply`, `--api-url`) to match the standard CLI convention, while the parser continues to accept both kebab and camelCase forms (`--api-url` and `--apiUrl` both map to the `apiUrl` input field).
