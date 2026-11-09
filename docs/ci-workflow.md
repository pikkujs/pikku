# Reusable CI workflow

`.github/workflows/pikku-checks.yml` runs the checks of `pikku ci` as parallel GitHub Actions jobs. Call it from any Pikku project:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  checks:
    uses: pikkujs/pikku/.github/workflows/pikku-checks.yml@main
```

Pin `@main` to a commit SHA or branch of your choice. The caller repository can be in another organisation only if `pikkujs/pikku` is public (it is) or its Actions access setting allows it.

## Jobs

`prepare` installs, runs your pre-step, then the same stages as `pikku ci` in the same order: `bootstrap`, `db migrate --localOnly` (when `db/sqlite`, `db/postgres` or `db/mysql` exists, never against a `DATABASE_URL`), `emails generate` (when the config's `emailTemplatesDir` exists), `all --failOnError` and `app build`. It uploads everything git ignores (except `node_modules`) as one tarball. `validate`, `audit`, `test` and `tsc` then run side by side, each with a cached install and that tarball.

Only the check stages are here. Deploying (`pikku ci -p <provider> --deploy`) is not generic and stays in your own workflow.

## Inputs

| Input | Default | Mirrors |
| --- | --- | --- |
| `working-directory` | `.` | where `pikku.config.json` lives |
| `bun-version` | empty: `packageManager` in `package.json`, else latest | |
| `node-version` | `24` | Node installed next to Bun, which codegen needs for some schemas |
| `pre-step` | empty | a shell command run after install, before codegen |
| `skip-tests` | `false` | `pikku ci --skip-tests` |
| `audit-baseline` | empty (uses `.deploy/audit.json` if present) | `pikku ci --audit-baseline` |
| `skip-deploy-checks` | `false` | `pikku ci --skip-deploy-checks` |
| `validate-blocking` | `true` | `false` makes findings annotate without failing |
| `audit-blocking` | `true` | same, for audit (the threshold is `high`, as in `pikku ci`) |
| `tsc` | `true` | runs `bun run tsc` when the project has it |
| `runs-on` | `ubuntu-24.04` | |

`--provider`, `--deploy`, `--keep-worktree`, `--worktree-dir`, `--migrations-applied` and `--secrets-set` only apply to the deploy path and have no input.
