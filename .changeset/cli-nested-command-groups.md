---
"@pikku/core": patch
"@pikku/cli": patch
---

Fix nested CLI subcommands: a command group that has subcommands but no function of its own now prints its subcommand help and exits non-zero, instead of falling through into execution. Nest the fabric `secrets` and `domains` commands into groups — `secrets set|list` and `domains list|add|remove` (previously `secretsSet`/`secretsList`/`domainsList`/`domainsAdd`/`domainsRemove`). Regroup `deploy` into `deploy plan` and `deploy apply` (replacing `deploy --dry-run`); the subcommand now carries the plan-vs-apply intent. `deploy apply` prompts for a classic yes/no confirmation before deploying — `--yes` skips it, and a non-interactive session refuses (re-run with `--yes`) rather than hang.
