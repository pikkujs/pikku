# Running a persona as a virtual user

`pikku persona run <environment> <persona>` signs a declared persona in over the
app's real auth and works the API in character, driven by a model. A persona
while running **is** the virtual user — there is no second declaration for it.

**It is not a test runner.** It asserts nothing, and a green run proves nothing:
what it produces is _findings_, and their absence is only ever "not this time,
not with this seed". Findings set exit code 1, so a run can gate a pipeline;
giving up on a goal does not, because that is a user being a user.

Everything it needs is already in the project — the catalogue is the function
meta, the intents are the scenarios' own prose, the identity is the persona
signing in, the scopes come from their declared roles. The only new input is
which person to be.

Declaring personas — persona versus actor, `definePersonas`, materialised
actors — is in the skill itself, under **Personas and actors**. This is the
running half.

## The shape of a run

```bash
SCENARIO_ACTOR_SECRET=… pikku persona run local shopper
SCENARIO_ACTOR_SECRET=… pikku persona run local shopper -d careless --seed 42
SCENARIO_ACTOR_SECRET=… pikku persona run staging auditor \
  --goals "reconcile the order totals" --steps 80 --out runs/auditor.json
```

Both arguments are required positionals: the environment key from
`environments`, then the persona id. A run needs a model — `--model`, or
`scenarios.model` in `pikku.config.json` — and an AI provider in the
environment (`OPENAI_BASE_URL` + `OPENAI_API_KEY`, or `LITELLM_PROXY_URL` +
`LITELLM_API_KEY`).

| Flag                   | Effect                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--disposition` / `-d` | How they behave. Overrides the persona's own                                                                                                          |
| `--goals`              | Comma-separated, in your words — run _alongside_ the persona's own and the ones derived from scenarios                                                |
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
temperature, repeat and re-read rates). `tuning` on the persona adjusts those
dials without replacing the character — a tuned `careless` user is still
careless. Passing `--disposition` drops the persona's `tuning`, because you
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
2. **`PIKKU_PERSONA_SECRETS`** — `id=secret,id=secret`, already-derived
   per-persona credentials. Hand a run only the personas it should be able to
   be; asking for one outside the list is refused by name rather than falling
   through to the root. Mint them with `pikku persona secret [personas...]` —
   naming none mints all.
3. **`SCENARIO_ACTOR_SECRET`** — the root secret, which derives every persona's
   credential and is therefore entitled to all of them. Only `pikku dev` serves
   the endpoint it opens.

## Production is opt-in, twice

A persona's `environments` omitted means every configured environment **except**
those flagged `production: true` — nothing reaches production by being
forgotten. Naming one requires `disposition: 'accountable'`.

That rule is checked twice on purpose: the inspector checks the declaration at
build time, and sign-in re-checks the **effective** disposition — the persona's
own, or whatever `--disposition` replaced it with — before the run starts. So
`--disposition adversarial` cannot point an accountable persona at production.
The build check trusts the file; the run check does not trust which artifact got
deployed.

**That rule is keyed on the environment's name, not its url.** `production:
true` is a label a person wrote in `pikku.config.json`; nothing can tell from a
url whether real customers are behind it. `--api-url` replaces the url and keeps
the classification, so a non-production environment repointed at a production
host is still treated as non-production, and an adversarial persona will happily
run against it. The flag is for a target that only exists at run time — a
freshly provisioned sandbox. Point it anywhere else and the guard above is not
protecting you.

## The role check happens before the first step

A run reads its own roles back from the stage and compares them to what the
persona declared. It refuses on a mismatch, before anything runs — findings
from a persona whose roles drifted are about the seed, and reading them as
product bugs is how a whole run gets thrown away. A stage that reports no roles
warns and runs unverified. `--skip-role-check` is for a target whose auth
reports roles somewhere pikku cannot read; findings from such a run may be seed
drift.

## The other subcommands

| Command                              | What it answers                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `pikku persona list`                 | Who is declared — who each one is, what they may do, what they want                        |
| `pikku persona sync <environment>`   | Which personas that environment will provision, with which roles, and why any were skipped |
| `pikku persona secret [personas...]` | Mint per-persona credentials from the root secret                                          |

`sync` **reports**; it does not provision. The CLI has no connection to a
deployed environment's database, so the provisioning happens in the deployment —
pass the generated personas to `pikkuFabric` from `@pikku/better-auth`.

## What NOT to do

- **Do not treat a clean run as a pass.** Nothing was asserted. Use scenarios
  for the things that must hold.
- **Do not run a persona declared `runnable: false`**, or one whose `account`
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
- **Do not expect `--goals` to replace the persona's goals.** They are appended;
  a run that replaces Susan's goals is not Susan.
