# Deploying a Fabric app

## Contents

- Deploy commands and organization targeting
- Rebuilding a disposable stage: `--reset`
- Exit codes, the approval gate, CI splitting, GitHub adoption and the upstream guard (inside Deploy commands)
- The first user on a deployed stage
- Opening a private stage

## Deploy commands and organization targeting

```bash
pikku fabric login              # opens a browser; needs a human, wait for it
pikku fabric init https://github.com/<owner>/<repo>
pikku fabric validate           # must pass clean
pikku fabric deploy apply --production -y
```

`init` and `link` import into whichever organization your session is in. When
you belong to several — a personal one and a company one, say — name the target
with `--organization`, taking a slug, a display name or an id:

```bash
pikku fabric link --organization vlandor
```

You have to be a member of the organization you name, and its GitHub account
has to be connected already: importing a `github.com/<owner>/<repo>` repo needs
the Fabric GitHub App installed on `<owner>` _and_ linked to that organization,
or the import refuses by name.

The branch is positional and defaults to the checked-out one, and `-y` is the
short form of `--auto-approve`, so a one-shot deploy is:

```bash
pikku fabric deploy apply -y            # the branch you are standing on
pikku fabric deploy apply my-branch -y  # a named one
```

`-y` answers the prompts and nothing more. It does **not** approve migrations
that drop or rewrite data — that stays `--allow-destructive`, typed out on
purpose.

## Rebuilding a disposable stage: `--reset`

A non-production stage whose migration history or schema has drifted (an app's
`develop` branch) can be wiped and rebuilt in one deploy:

```bash
pikku fabric deploy apply develop --reset      # asks first, naming app + stage
pikku fabric deploy apply develop --reset -y   # prints the warning, skips the prompt
```

It is the deployed counterpart of `pikku db reset`: **all data on that stage is
deleted**, every migration is re-applied and `db/<engine>-dev-seed.sql` is
loaded. It is refused for `--production`, for `main`, and with `--deployment-id`
(it only applies to a deploy it creates). It needs a fabric server that reports
the reset back on the deployment; against one that does not, the command fails
naming the deployment it created without a reset, and wipes nothing. `-y` does
not imply `--allow-destructive`.

Inferring the branch is safe because the git safety check refuses any branch
without an upstream or out of sync with it, so it cannot ship an unpushed
commit; the branch it picked is printed before the build starts. A detached
HEAD is refused by name rather than travelling on as a branch called `HEAD`.

There is no `deploy plan` subcommand — `apply` runs the same auth, git-safety
and ref resolution itself, and fabric produces the real plan server-side.

`apply` confirms before deploying, and with no TTY to ask — CI, an agent shell —
it refuses rather than hangs. `--auto-approve` (`-y`) supplies that confirmation;
drop it only when a human is at a real terminal.

`apply` waits for a terminal state and exits non-zero unless the deployment went
live. `--detach` opts out — it queues the deploy, prints the deployment id and
returns 0, which tells you nothing about whether it worked:

| exit | meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| 0    | live (or queued, under `--detach`)                                      |
| 1    | the command could not run — not logged in, unsafe git state, bad flags  |
| 2    | the deployment failed, errored, timed out server-side, or was cancelled |
| 3    | the deployment is blocked and nothing the CLI can do will unblock it    |
| 4    | the wait hit `--timeout` with the deployment still in flight            |

On a failure or timeout, `apply` prints the tail of the builder's own log (and
carries `buildLog` / `imageBuildLog` on the `--json` result). Read it before
touching code: `fabric logs` serves the running stage, not the build. When the
builder recorded nothing, the CLI says so — that is usually fabric-side, so run
`pikku fabric smoke` before assuming the project is broken.

Fabric parks every deploy at a gate after the plan phase (`status: suspended`).
Why it parked is the whole story, and it is `statusReason`, not `status`:

- `awaiting_approval` — the plan is fine, a human has to publish it.
  `-y` does that; without it you get exit 3 and the command to run.
  One exception: if fabric marked any pending migration **destructive** — a
  drop, a truncate, a rewrite — `-y` alone declines and exits 3,
  because a standing yes was given before anyone knew the plan dropped a table.
  The CLI lists the migrations and fabric's reasons; `--allow-destructive`
  accepts them for that deploy, and `-y` implies it.
- `needs_config` — a declared secret or variable has no value covering the
  stage. The CLI names them. `-y` will **not** force this through;
  set the values and re-attach — `pikku fabric secrets set <name>` for a
  declared secret, `pikku fabric variables set <name> --value <v>` for a declared
  variable. They are separate stores: a secret is sealed to the stage and cannot
  be read back, a variable is stored plainly and can (`variables get`). `set`
  reads the value as JSON when it parses, so `--value true` is the boolean on a
  stage exactly as it is from `.env`, and `--value '"true"'` is the string.
- `needs_attention` — the plan is red. Nothing to approve.

The wait defaults to a 900s ceiling; `--timeout <seconds>` moves it. On timeout
it prints the deployment id and the re-attach command rather than lying about
the outcome.

Splitting kick-off from waiting across two CI jobs is the reason
`--deployment-id` exists, and what `--detach` is for — the first job here has to
return the id and exit rather than wait:

```bash
id=$(pikku fabric deploy apply --production -y --detach --json | jq -r 'select(.event=="result").deploymentId')
# …later, in another job…
pikku fabric deploy apply --deployment-id "$id" -y
```

`--deployment-id` skips the git safety check entirely (the deployment already
pins a sha, and the checkout is allowed to have moved on) and refuses to be
combined with a branch or `--production`, which would let the two disagree.

Under `--json`, the wait emits one NDJSON event per line — `created`/`attached`,
`status` on each transition, `blocked`, `approved` — and the last line is the
terminal result object, tagged `"event": "result"`.

`init` adopts a **GitHub** repo, and adoption goes through the Pikku Fabric
GitHub App — the app has to be installed on the account or org that owns the
repo, and if it is installed with "selected repositories" this one must be in
the selection. There is no CLI flag that works around a missing installation:
`init` returns "Connect the GitHub account '<owner>'". Send the user to install
it, or create the project in the console instead (which provisions a Fabric-hosted
git repo you push to) and clone it — the remote links the checkout, or put
the id in `fabric.projectId` in `pikku.config.json`.

Deploy refuses to run unless the target branch equals its upstream — the guard
compares `main` against `main@{upstream}`. So the remote you pushed to must be
the one the branch tracks; a stale `origin` left over from scaffolding blocks
the deploy with "local HEAD … ≠ remote …" even though your code is pushed.
`git branch --set-upstream-to=<remote>/main main` before deploying.

## The first user on a deployed stage

When sign-up is off, the first account has to come from outside the app.
`pikku fabric user add <email>` is the CLI form of the console's Add user:

```bash
pikku fabric user add ada@example.com --name Ada          # prompts; blank generates one
pikku fabric user add ada@example.com --password '<pw>' -b staging
```

It mints a short-lived operator token for the stage and calls the stage's own
`admin:createUser`, so the stage must wire `@pikku/addon-admin` as `admin` —
a 404 is refused by name and nothing is created. A generated password is printed
once; one you passed is never echoed. With no TTY, pass `--password` or pipe it.

## Opening a private stage

A non-production stage is private: without a link it answers "This preview is
private". `pikku fabric stage link` prints the link that opens it:

```bash
pikku fabric stage link access -b develop --route /login   # use the stage
pikku fabric stage link changes -b develop                 # use it with the changes panel
pikku fabric stage visibility public -b develop            # or: private
```

A stage has one live link of each kind, so asking again returns the same one
until it expires. A `changes` link turns the panel on first; if that needs a
deploy, the command says so. `visibility public` opens the stage to anyone with
its URL — hand out an `access` link instead when that is all you need.
