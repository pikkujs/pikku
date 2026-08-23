---
'@pikku/cli': patch
---

feat(fabric): `deploy apply --sync` waits for the deploy and fails the build when it doesn't land

`pikku fabric deploy apply` queued a deployment, printed its id and exited 0.
Whether the deploy went live, failed, or parked itself at fabric's approval gate
waiting for a human, the CLI said the same thing and returned the same code — so
no CI pipeline built on it could tell a green deploy from a red one.

`--sync` polls the deployment to a terminal state and exits on the outcome: 0
live, 2 failed, 3 blocked, 4 timed out (900s by default, `--timeout <seconds>`
to move it). On success it prints what changed — units, handlers, functions,
workflows, secrets, variables, pending migrations (destructive ones called out
individually with fabric's reasons) — and the workers now running.
Under `--json` the wait emits NDJSON progress events with the terminal result
last.

It polls `getDeploymentStatus`, not `listDeployments`, because only the former
carries `statusReason` — and `suspended` alone cannot tell "waiting for you to
approve" from "blocked on a secret that has no value". A caller polling for
`active` on the second one waits out its whole timeout on a deployment that was
never going to move. The CLI now names the missing secrets and variables
instead, and only offers to approve a plan that is genuinely at the gate.

- `--auto-approve` **replaces `--auto-apply`**, with no alias. It answers both
  decisions the flow has: confirm the create, and publish a plan parked at
  `awaiting_approval`. It deliberately will not force a `needs_config` or
  `needs_attention` plan through — fabric refuses those, and so do we.
- `--allow-destructive` is required on top of `--auto-approve` when fabric's
  plan marks a pending migration destructive (`drop_table`, `truncate`,
  `delete_rows`, a column rewrite, …). `--auto-approve` is a standing yes
  written before anyone knew what the plan contained, and the risk verdict is
  exactly what could not have been known — so the CLI lists the migrations and
  the reasons, exits 3, and waits to be told again with the plan in view. The
  interactive prompt shows the same lines inside the question.
- `--deployment-id <id>` attaches to an existing deployment instead of creating
  one, which is what lets one CI job kick a deploy off and a later one wait for
  it. It combines with `--sync` and `--auto-approve`, is rejected alongside
  `--branch`/`--production`, and skips the git safety check — the deployment
  already pins a sha and the local checkout is allowed to have moved on.
- **`deploy plan` is removed.** It never called the server: it re-ran the same
  auth, branch-safety and ref resolution `apply` does and printed the sha back.
  The real plan is produced server-side and is now visible in `apply`'s output.
- The `message` field on the deploy input is gone. Nothing ever sent it.

Attaching reads `getDeploymentStatus` for the deployment's existence and state
and treats the project listing as a bonus lookup for the branch name and diff.
The listing hides dismissed deployments unless asked, and a cancelled deploy is
normally dismissed — going to it first reported "no such deployment" for one
that existed and had a terminal status worth failing the build on.

The bundled fabric rpc-map snapshot gains `applyDeployment` and
`getDeploymentStatus` and drops `reapplyDeployment`, which fabric no longer
serves.
