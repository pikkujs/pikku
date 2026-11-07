---
type: decision
title: pikku ci -p builds the commit in a throwaway worktree, and --deploy never picks a target
description: With -p, pikku ci refuses a dirty tree, runs in a detached git worktree it always removes, copies only .deploy back, and --deploy without -p is an error; db migrate under ci refuses any non-loopback database
tags: cli, ci, deploy, security
---

# pikku ci -p builds the commit in a throwaway worktree, and --deploy never picks a target

`pikku ci` is the release gate, so what it plans has to be exactly the commit.
With `-p` it refuses uncommitted work, checks `HEAD` out into a detached worktree
(under the system temp directory, or `--worktreeDir`), installs with
`bun install --frozen-lockfile`, and removes the console scaffold there before
planning. Only `.deploy/` comes back, and `audit.json` only when the run passed,
so a failed audit can never become the next run's baseline. The worktree is
removed in a `finally` and on SIGINT/SIGTERM; `--keepWorktree` is the one way to
keep it.

`--deploy` applies the plan's own output (`--fromPlan`) rather than rebuilding,
and requires `-p`: falling back to `deploy.defaultProvider` would let a missing
flag ship somewhere the caller did not name.

The `db migrate` stage passes `--localOnly`, which refuses any connection string
whose host is not loopback (and any `host=`/`hostaddr=` override). Dropping
`DATABASE_URL` from the child environment is not enough on its own, because the
CLI loads `.env` from the project directory at start-up.

Cloudflare cannot be asked which migrations are applied, so `--deploy -p
cloudflare` treats every shipped migration as pending until `--migrationsApplied`
says otherwise, and refuses unset required secrets.

**What this rules out:** running the `-p` pipeline in the caller's tree (codegen
and console removal would dirty it, and uncommitted work would ship), and a
default deploy target for `pikku ci`.
