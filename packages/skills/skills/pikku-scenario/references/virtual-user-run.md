# Running a virtual user against a stage

## Contents

- [The shape of a run](#the-shape-of-a-run)
- [The dispositions](#the-dispositions)
- [Credentials, and which one wins](#credentials-and-which-one-wins)
- [Production is opt-in, twice](#production-is-opt-in-twice)
- [The role check happens before the first step](#the-role-check-happens-before-the-first-step)
- [The other subcommands](#the-other-subcommands)
- [What NOT to do](#what-not-to-do)

`pikku virtual-user run <environment> <virtualUserId>` signs a declared virtual user in over the
app's real auth and works the API in character, driven by a model. A virtual user
while running **is** the virtual user — there is no second declaration for it.

**It is not a test runner.** It asserts nothing, and a green run proves nothing:
what it produces is _findings_, and their absence is only ever "not this time,
not with this seed". Findings set exit code 1, so a run can gate a pipeline;
giving up on a goal does not, because that is a user being a user.

Everything it needs is already in the project — the catalogue is the function
meta, the intents are the scenarios' own prose, the identity is the virtual user
signing in, the scopes come from their declared roles. The only new input is
which person to be.

Declaring virtual users — virtual user versus virtual user, `defineVirtualUsers`, materialised
virtual users — is in the skill itself, under **Virtual users and virtual users**. This is the
running half.

## The shape of a run

```bash
SCENARIO_VIRTUAL_USER_SECRET=… pikku virtual-user run local shopper
SCENARIO_VIRTUAL_USER_SECRET=… pikku virtual-user run local shopper -d careless --seed 42
SCENARIO_VIRTUAL_USER_SECRET=… pikku virtual-user run staging auditor \
  --goals "reconcile the order totals" --steps 80 --out runs/auditor.json
```

Both arguments are required positionals: the environment key from
`environments`, then the virtual user id. A run needs a model — `--model`, or
`scenarios.model` in `pikku.config.json` — and an AI provider in the
environment (`OPENAI_BASE_URL` + `OPENAI_API_KEY`, or `LITELLM_PROXY_URL` +
`LITELLM_API_KEY`).

| Flag                   | Effect                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--disposition` / `-d` | How they behave. Overrides the virtual user's own                                                                                                     |
| `--goals`              | Comma-separated, in your words — run _alongside_ the virtual user's own and the ones derived from scenarios                                           |
| `--steps`              | Model turns before it stops (default 40)                                                                                                              |
| `--mutations`          | Non-read calls before it stops                                                                                                                        |
| `--duration`           | Wall clock before it stops, e.g. `30m`                                                                                                                |
| `--seed`               | Replay — the same seed schedules the same run                                                                                                         |
| `--model`              | The model they think with                                                                                                                             |
| `--allow-approval`     | Offer the endpoints the app marked as needing a human's approval. Off by default: those are the ones that spend money                                 |
| `--skip-role-check`    | Start without verifying declared roles against the stage                                                                                              |
| `--api-url`            | Override the environment's `apiUrl`, for a target that only exists at run time. It replaces the url, not the environment's classification — see below |
| `--out`                | Write the whole run — every step, response and finding — as JSON                                                                                      |

## The dispositions

A disposition is a bundle of instructions and mechanical dials (move weights,
temperature, repeat and re-read rates). `tuning` on the virtual user adjusts those
dials without replacing the character — a tuned `careless` user is still
careless. Passing `--disposition` drops the virtual user's `tuning`, because you
asked to run them differently rather than to bend their dials into another
shape.

| Disposition   | Who that is                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `realistic`   | The default. A competent user reading schemas and entering plausible values                                                   |
| `careless`    | Busy, interrupted, half-remembering; submits twice, enters odd-but-legal values. **Where most production bugs actually live** |
| `newcomer`    | First time here, holds no ids in their head, must find a path from the lists that exist (`emptyMemory`)                       |
| `stale`       | Working from old notes — reaches for ids that may no longer resolve, to see how the product says so                           |
| `auditor`     | Reconciling, not achieving: reads one fact from every endpoint claiming to know it and reports disagreement. Read-only        |
| `adversarial` | Probing whether the boundaries are enforced. Inverted oracle — a 2xx from something it should not reach is the finding        |
| `accountable` | Doing the job for real. The **only** disposition production accepts                                                           |

## Credentials, and which one wins

Three variables, checked in this order. None of them belongs in
`pikku.config.json`.

1. **`FABRIC_OPERATOR_TOKEN`** — what a deployed stage accepts. Asymmetric, and
   it needs no account the target would not otherwise have, so it wins over the
   other two when both are present.
2. **`PIKKU_VIRTUAL_USER_SECRETS`** — `id=secret,id=secret`, already-derived
   per-virtual-user credentials. Hand a run only the virtual users it should be able to
   be; asking for one outside the list is refused by name rather than falling
   through to the root. Mint them with `pikku virtual-user secret [virtual users...]` —
   naming none mints all.
3. **`SCENARIO_VIRTUAL_USER_SECRET`** — the root secret, which derives every virtual user's
   credential and is therefore entitled to all of them. Only `pikku dev` serves
   the endpoint it opens.

## Production is opt-in, twice

A virtual user's `environments` omitted means every configured environment **except**
those flagged `production: true` — nothing reaches production by being
forgotten. Naming one requires `disposition: 'accountable'`.

That rule is checked twice on purpose: the inspector checks the declaration at
build time, and sign-in re-checks the **effective** disposition — the virtual user's
own, or whatever `--disposition` replaced it with — before the run starts. So
`--disposition adversarial` cannot point an accountable virtual user at production.
The build check trusts the file; the run check does not trust which artifact got
deployed.

**That rule is keyed on the environment's name, not its url.** `production:
true` is a label a person wrote in `pikku.config.json`; nothing can tell from a
url whether real customers are behind it. `--api-url` replaces the url and keeps
the classification, so a non-production environment repointed at a production
host is still treated as non-production, and an adversarial virtual user will happily
run against it. The flag is for a target that only exists at run time — a
freshly provisioned sandbox. Point it anywhere else and the guard above is not
protecting you.

## The role check happens before the first step

A run reads its own roles back from the stage and compares them to what the
virtual user declared. It refuses on a mismatch, before anything runs — findings
from a virtual user whose roles drifted are about the seed, and reading them as
product bugs is how a whole run gets thrown away. A stage that reports no roles
warns and runs unverified. `--skip-role-check` is for a target whose auth
reports roles somewhere pikku cannot read; findings from such a run may be seed
drift.

## The other subcommands

| Command                                        | What it answers                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pikku virtual-user list`                      | Who is declared — who each one is, what they may do, what they want                             |
| `pikku virtual-user sync <environment>`        | Which virtual users that environment will provision, with which roles, and why any were skipped |
| `pikku virtual-user secret [virtual users...]` | Mint per-virtual-user credentials from the root secret                                          |

`sync` **reports**; it does not provision. The CLI has no connection to a
deployed environment's database, so the provisioning happens in the deployment —
pass the generated virtual users to `provisionVirtualUsers` from `@pikku/better-auth`.

## What NOT to do

- **Do not treat a clean run as a pass.** Nothing was asserted. Use scenarios
  for the things that must hold.
- **Do not run a virtual user declared `runnable: false`**, or one whose `account`
  names a provider. The first is someone who exists to be acted upon — running
  her races the scenario that bans her — and the second needs a human at a
  consent screen. Both are refused before sign-in rather than partway through.
- **Do not use `--api-url` to reach a production host from a non-production
  environment.** The disposition guard reads the named environment's
  `production` flag, not the url you pointed it at, so nothing will stop you.
- **Do not put any of the three credentials in `pikku.config.json`.** They are
  environment variables.
- **Do not pass `--allow-approval` casually.** The endpoints behind it are the
  ones the app marked as needing a human because they spend money.
- **Do not read a finding from a run started with `--skip-role-check` as a
  product bug** until the roles are confirmed some other way.
- **Do not expect `--goals` to replace the virtual user's goals.** They are appended;
  a run that replaces Susan's goals is not Susan.
