---
'@pikku/core': patch
'@pikku/cli': patch
---

Fix nested CLI subcommands: a command group that has subcommands but no function of its own now prints its subcommand help and exits non-zero, instead of falling through into execution. Nest the fabric `secrets` and `domains` commands into groups — `secrets set|list` and `domains list|add|remove` (previously `secretsSet`/`secretsList`/`domainsList`/`domainsAdd`/`domainsRemove`). Regroup `deploy` into `deploy plan` and `deploy apply` (replacing `deploy --dry-run`); the subcommand now carries the plan-vs-apply intent. `deploy apply` prompts for a classic yes/no confirmation before deploying — `--auto-apply` skips it, and a non-interactive session refuses (re-run with `--auto-apply`) rather than hang.

CLI option flags now render in kebab-case in help and error messages (`--auto-apply`, `--api-url`) to match the standard CLI convention, while the parser continues to accept both kebab and camelCase forms (`--api-url` and `--apiUrl` both map to the `apiUrl` input field).

The global `--json` / `--output json` flag now routes a command's returned result through the JSON renderer, so any command that declares a `render` gets machine-readable output for free. Commands without a `render` are unaffected (they keep emitting their own output), so this is non-breaking. This lets read commands return structured data and keep their human formatting in a service-free `render` (coloured with chalk), with `--json` always emitting the full result.

New read-only fabric commands: `deploy list` / `deploy units` (deployments and worker topology for a branch), `status` (active + in-flight deploy), `errors` (recent error-level events with traceIds), and `db schema` (live database tables/columns). All render a coloured table by default and the full payload under `--json`.

`deploy plan` and `deploy apply` now have distinct output shapes — `plan` returns `{ projectId, branch, ref, requestedRef? }` (nothing is queued yet) and `apply` adds `{ deploymentId, stageId, runId }`, instead of one shape padded with empty-string sentinels. Both moved their human output into coloured service-free renders, so they honour `--json` too.
