---
"@pikku/core": patch
"@pikku/cli": patch
---

Fix nested CLI subcommands: a command group that has subcommands but no function of its own now prints its subcommand help and exits non-zero, instead of falling through into execution. Nest the fabric `secrets` and `domains` commands into groups — `secrets set|list` and `domains list|add|remove` (previously `secretsSet`/`secretsList`/`domainsList`/`domainsAdd`/`domainsRemove`).
