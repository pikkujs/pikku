---
'@pikku/cli': patch
---

`fabric deploy apply` waits by default, takes the branch positionally, and gains `-y`

Shipping a branch unattended took four flags and a `--branch` that would not
accept the branch as an argument:

```bash
pikku fabric deploy apply --branch my-branch --sync --auto-approve
```

Three changes, all subtractive:

- The branch is **positional**, matching `fabric rollback`, and defaults to the
  checked-out branch when nothing names a target.
- `--auto-approve` gains the short form **`-y`**, matching `rollback --yes`.
- **`--sync` is gone: waiting is now the default.** `--detach` opts out.

```bash
pikku fabric deploy apply -y                 # deploys, waits, reports
pikku fabric deploy apply my-branch -y       # a named branch
pikku fabric deploy apply --detach -y --json # queue and exit, for split CI jobs
```

Waiting became the default because the old one reported success before anything
had happened: without `--sync`, `apply` queued the deployment and exited 0
whether or not it went on to fail. That is the exotic case, and it now costs the
flag rather than the other way round.

`-y` answers prompts and nothing else — in particular it does **not** approve
migrations that drop or rewrite data. That remains `--allow-destructive`, typed
out on purpose, and still refuses to self-approve without it.

Branch inference is safe because the existing git safety check refuses a branch
with no upstream or one out of sync with it, so it cannot ship an unpushed
commit; the chosen branch is printed before the build starts, and a detached
HEAD is refused by name.

Breaking: `--sync` and `--branch`/`-b` are gone. Pass the branch positionally,
and `--detach` where you relied on queue-and-exit. Passing a branch together
with `--production` is now an error, where previously passing neither was.
