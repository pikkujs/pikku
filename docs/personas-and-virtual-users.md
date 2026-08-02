# Personas, roles and virtual users

Status: **design, not implemented.** Nothing in this document is on `feat/virtual-users` yet.

## The problem

Pikku has four words for "who is doing this" and they overlap:

| word | where | what it means today |
|---|---|---|
| `actor` | `scenarios.actors` | a login — email, scopes, roles — **and** a personality |
| `persona` | `scenarios.personas` | the KIND of person (`description`, `proficiency`) |
| `role` | `ScopeService` | a named, admin-composed bag of scopes |
| virtual user | `pikkuVirtualUser()` | an LLM signing in as an actor |

Two things are broken.

**`actor` runs the metaphor backwards.** An actor *plays* a persona, so you expect one
actor to many personas. Pikku has one persona to many actors. No amount of documentation
fixes a backwards metaphor.

**The individuating detail is on the wrong layer.** `name`, `jobTitle` and `personality`
live on the actor (the body), not the persona (the kind). So two bodies of one persona
are two different characters, and `actor` genuinely *feels* like the persona — because it
holds the personality. The console says so out loud:

> `personas_defined_in`: "Personas are defined in pikku.config.json under scenarios.actors."

## The model

| layer | word | what it is | declared |
|---|---|---|---|
| what you may do | **role** | a named bag of scopes | `defineSystemRole()` — code, additive |
| who you are | **persona** | a person: name, backstory, goals, roles | `definePersonas()` — code |
| how you sign in | **account** | one login of that person | inside the persona |
| who is acting | **actor** | whoever performs this step | a step parameter |
| a persona, running | **virtual user** | the thing hitting your stage at 3pm | `pikku persona run <name>` |

`actor` stops being a noun you declare and becomes the part something plays in a step —
which is its honest use. `virtual user` stops being a declaration and becomes the runtime.

### Persona is the correct word

Alan Cooper's definition: *a fictional character representing a user type expected to use
a product*. That is exactly "the users you expect to use your app". Cooper's personas
always carried names, photos and backstories, for the reason that matters here: nobody
argues on behalf of "User Type B", but people will argue on behalf of Susan.

Naming the declaration `defineVirtualUsers()` would name the **mechanism** (an LLM driving
an API) rather than the **thing** (who you are building for). It also breaks for personas
that are never run — see "not every persona runs" below.

## Personas in code

```ts
definePersonas({
  susan: {
    name: 'Susan',
    jobTitle: 'Buys for a small café',
    roles: ['buyer'],                    // typechecked against defineSystemRole()
    personality: 'Hunts cheap deals. Tries three coupon codes before giving up.',
    goals: [
      'Get the weekly order in under five minutes',
      'Never pay full price for anything',
    ],
    disposition: 'careless',             // default; a run may override
    tuning: { repeatRate: 0.3 },
    fixtures: ['seedCatalogue'],
  },

  yasser: {
    name: 'Yasser',
    jobTitle: 'Founder',
    roles: ['admin', 'buyer'],
    personality: 'Moves fast, 40 tabs open, never reads a confirmation dialog.',
    accounts: { google: {}, github: {} },   // one human, two logins
  },

  mallory: {
    name: 'Mallory',
    roles: ['buyer'],                    // an ordinary account. That is the point.
    personality: 'Reads other people’s IDs out of URLs and tries them.',
    disposition: 'adversarial',
  },
})
```

Moving personas from config into code buys three things:

1. `roles` can be typechecked against declared roles.
2. The inspector picks them up like every other wiring.
3. It **deletes a special case** — `knowledge/src/resource-uri.ts` has a test named
   *"takes personas from the config, the one prefix with no codegen behind it"*. Personas
   are currently the only knowledge prefix without codegen behind them.

### The "hacker" is not a layer

An adversarial user is not a fourth kind of thing. It decomposes:

| question | answer | layer |
|---|---|---|
| what may they do | `buyer` | role |
| how do they behave | adversarial | disposition |
| who are they | Mallory, reads IDs out of URLs | persona |

Which is the more interesting test anyway: not an outsider hammering the door, an
ordinary logged-in customer probing what they can reach.

## `wire*` versus `define*`

`wire*` currently means two different things. `wireHTTP`, `wireChannel`, `wireScheduler`,
`wireQueueWorker` and friends attach a function to something that can invoke it. But
`wireScope`, `wireSecret`, `wireVariable` and `wireCredential` wire nothing —
`wire-scope.ts` says so outright:

> *No-op function for declaring scopes. This exists purely for TypeScript type checking
> and will be tree-shaken. The CLI extracts metadata via AST parsing and generates a
> `ScopeId` union.*

The four declaration functions are being renamed so each word means one thing:

> **`wire*`** — this function can now be invoked by X.
> **`define*`** — this name exists, and the build will check you used it.

`defineScope`, `defineSecret`, `defineVariable`, `defineCredential`. Everything this
document adds is a declaration, so it is `define*` throughout.

## Roles: `defineSystemRole()`

Roles are currently **runtime-composed on purpose** — `ScopeService.createRole`,
`setRoleScopes`, and a console editor, so an admin can invent `invoicing-clerk` without a
deploy. A code declaration must not take that away.

So a code declaration does not replace runtime roles; it introduces a second, distinct
class. The AWS parallel is exact:

| AWS | pikku |
|---|---|
| AWS-managed policies — attach, cannot edit or delete | **system roles** — `defineSystemRole()`, code |
| Customer-managed policies — yours, full control | **custom roles** — console, `createRole()` |

A system role is part of the *product*. A custom role is part of one customer's
configuration.

### "System" has to be enforced, not labelled

Three behaviours the code does not have today. Without them "system" is a comment:

| | |
|---|---|
| `deleteRole` / `setRoleScopes` | must refuse for a system role |
| the console | must render the lock **and say why** — not fail on click |
| creating a custom role that shadows a system name | must be refused |

The third is a security bug rather than a UX annoyance: a custom `admin` shadowing the
system `admin` silently changes what every persona and every permission check means.

### Removal copies `defineScope` verbatim

`syncScopes` is deliberately additive — *"scopes are declared in code, so a removed
declaration leaves an inert row rather than silently revoking a grant mid-deploy"* — with
`pikku scopes prune` as the explicit removal.

Roles must behave identically. Deleting a `defineSystemRole` declaration leaves the role
inert and still granted, marked undeclared, until `pikku roles prune`. The alternative is
that deleting one line revokes access for everyone holding it, at deploy time, silently.

### Personas may only use system roles

```ts
susan: { roles: ['buyer'] }             // system, typechecked
susan: { roles: ['invoicing-clerk'] }   // custom — an admin can delete this. Refused.
```

A custom role does not exist at build time and can be deleted from the console, so a
persona pinned to one silently stops testing what it claims to. That is the same failure
mode as the unexposed RPCs: it does not error, it just quietly stops meaning anything.

Which gives `defineSystemRole` a second job beyond safety — it is the set of roles that
ship *with the product*, and that is exactly the set personas should be built from.

Nothing is removed from admins. Personas get something real to typecheck against, and the
app is pushed to think in roles rather than describing permissions in prose. (The old
`guest` actor's `personality` was *"Read-only user who can see reports and nothing else"* —
that is a permission wearing a personality.)

## Accounts

An account is a login: an email or a provider identity, plus any roles and scopes granted
to it. Accounts are nested inside their persona, which makes a dangling reference
unrepresentable and deletes the check in `resolve-scenario-actors.ts:46-51` that exists
only to catch one.

```ts
yasser: {
  // ...
  accounts: { google: {}, github: {} },
}
```

Two payoffs:

- **Account linking.** One human with a Google and a GitHub login is a real bug class —
  whether your app links them, and whether unlinked accounts stay separate. Run 4 of the
  virtual user hit this by accident (`triggerWebhook` with `event: 'account-linking'`).
- **Second bodies.** Tenant-isolation and peer-sharing scenarios need two distinct rows.
  Today that means inventing a second character; now it is a second account, or a second
  named persona if they deserve a name.

Most personas need no `accounts` block at all — one is materialised, as today.

## Virtual users collapse into personas

A persona already has a name, roles, personality, goals and a disposition. A virtual user
adds almost nothing that is a fact about the person. Of the 11 fields on
`VirtualUserMeta`:

| field | goes to | why |
|---|---|---|
| `name`, `description` | persona | who she is |
| `goals` | persona | UX personas have goals; it is the standard template |
| `disposition`, `tuning` | persona (default) | a run may override |
| `tags`, `fixtures` | persona | |
| `actor` | **deleted** | she *is* the identity |
| `grants` | **deleted** | `roles: ['buyer']` already says this |
| `budget` | **run** | how much you will spend today is not a fact about Susan |
| `allowApprovalRequired` | **run** | see below |

```bash
pikku persona run susan --stage=staging --steps=40 --budget='$2'
```

### The safety argument

`allowApprovalRequired: true` opens the endpoints that spend money and move real traffic.
Today it lives in a **checked-in declaration** — a standing authorization that survives
every future run, granted by whoever wrote the file months ago. It should be a decision
made by the person running it, at the moment they run it. `budget` is the same: a cost
ceiling committed to git is a ceiling nobody re-reads.

So the collapse is not only "two things become one" — it forces the two run-scoped fields
out of the file where they do not belong.

### `grants` dies

`grants` narrows the catalogue to what the actor can satisfy. With `roles` on the persona
resolving to scopes, that is derivable. The worst field in the API — one name meaning two
different things depending on disposition — stops existing rather than getting fixed.

### Durable goals vs situational goals

Persona goals are durable (*"never pay full price"*). Run goals are situational (*"check
the coupon flow we shipped Tuesday"*). A run **appends**, never replaces:

```bash
pikku persona run susan --goal="exercise the new coupon flow"
```

Same append-not-replace rule as `tuning.instructions`, for the same reason: a run that
silently replaces Susan's goals is not Susan.

### Not every persona runs

Declaring is not running. `target` — the persona that admins act *upon* — is declared,
seeded, and never run. This is why the declaration is `definePersonas` and not
`defineVirtualUsers`.

## Non-person subjects

### `kind: 'system'` should be deleted

`kind: 'system'` on a persona has exactly one consumer in the repo:

```ts
// resolve-scenario-actors.ts:62
if (config.kind === 'system') continue
```

Nothing in the console reads it, nothing in the knowledge base reads it, and no
`pikku.config.json` in the repo declares one. A field whose entire implementation is
*"skip the thing this registry exists to do"* is a field admitting it is in the wrong
registry.

It also fails the definition. The system is not a user of your app — it **is** your app.

What it was reaching for is a grammatical subject in scenario prose: *"Given the system
has expired the trial"*. That is already representable as a step with no actor. Deleting
`kind` buys a definition with no asterisk: **a persona is a person.**

### Addons are the third-party systems

Pikku already has them:

```ts
wireAddon({ name: 'stripe', package: '@addon/stripe', ... })   // wire-addon.test.ts:14
```

plus `mailgun.addon.ts` in the e2e app. So *"Stripe's webhook arrives"* and *"Mailgun
bounces it"* are steps contributed by the addon that wraps that service — not a new
concept, an existing one noticed.

### Two new step kinds

**Recommended: separate declarations rather than a `type` field.**

```ts
pikkuScenarioStep({ browser, cli, default })   // a persona acts — many surfaces
pikkuPlatformScenarioStep({ func })            // the app acts on itself
pikkuAddonScenarioStep({ addon, func })        // a third-party system acts
```

Separate functions beat `type: 'persona' | 'addon' | 'platform'` because:

- the inspector verifies by which function was called, not by a string literal;
- the signatures genuinely differ — an addon step must name its addon, a platform step
  must not;
- an addon package can only export addon steps, which is checkable.

### Platform and addon steps take one `func`, not bindings

`pikkuScenarioStep` declares one implementation **per surface** — the way an actor drives
the system. `browser` drives a real browser as a human; `cli` goes over the websocket;
`default` runs server-side.

Neither of the new kinds has surfaces. Nobody clicks *"Stripe's webhook arrives"*; there
is no human behind *"the platform has expired the trial"*. So both take a single `func`.

`func` rather than `default:` is deliberate. `default` means *the fallback when no other
surface applies*, which implies other surfaces could exist. `func` says structurally that
there is one way this happens. That gives the inspector something crisp to enforce: a
`browser:` or `cli:` key on a platform or addon step is a coded error rather than a
convention nobody reads.

It also keeps the phase rule coherent. An assertion runs **every** witness it has and
fails if they disagree — `default` says the system of record is right, `browser` says the
truth reached the human. A platform or addon step has exactly one witness by
construction, so there is nothing to disagree with, and no way to write a step that looks
like it has multiple witnesses but does not.

### Addon steps are the stub

An addon's scenario steps *are* the mock its consumers currently hand-write. Shipped by
the addon author, maintained with the addon, and the same artifact that appears in the
prose. This is consolidation, not new surface.

Note that arrange and assert are different: *"Stripe's webhook arrives"* stubs; *"Then
Stripe was charged"* asserts. Only the first is a stub.

### Platform and addon steps must be invisible to virtual users

Not for tidiness — for oracle integrity.

A virtual user's findings are only worth anything because it cannot manufacture the
outcomes it is supposed to be discovering. A virtual user that can invoke *"Stripe's
webhook arrives"* can **forge its own payment success**, and every finding downstream of
that is worthless. Same class of argument as `allowApprovalRequired` defaulting to false.

So: platform and addon steps are local-test-only, never in the virtual user's catalogue,
and this should be enforced at derivation (like `expose !== true` already is) rather than
by convention.

## Migration

| | |
|---|---|
| new | `defineSystemRole()` + additive sync, refusal-to-delete, shadow check |
| renamed | `wireScope`/`wireSecret`/`wireVariable`/`wireCredential` -> `define*` |
| new | `definePersonas()` + inspector support |
| new | `pikkuPlatformScenarioStep`, `pikkuAddonScenarioStep` |
| moved | `scenarios.actors` / `scenarios.personas` → code (9 read-sites) |
| moved | `budget`, `allowApprovalRequired` → run flags |
| deleted | `kind`, `grants`, `actor`, the dangling-persona check, the knowledge special case |
| touched | `personality` / `jobTitle` — ~28 files, ~20 of them console display |

No config version machinery exists, so this is a clean rename rather than a migration.

## Open questions

1. **Emails are environment-specific.** Derive `susan@personas.local` by default and
   override per environment in config? Personas move to code; environment data cannot.
2. **Is `roles` on a persona a declaration or an expectation?** Declaration (the seed
   grants exactly this) plus a startup check is the recommendation — a persona whose roles
   do not match the store invalidates every finding it produces.
3. **Does the injected `actors` service keep its name** or become `accounts`? Keeping it
   halves the blast radius and `actor` is defensible at the step level.
4. **Do personas get default roles that accounts override**, or do roles stay strictly on
   the account? Leaning strictly-on-the-account — a persona that grants scopes is a role
   by another name, and roles already exist.

## Deliberately out of scope

- **Third-party systems that are not addons** — *"When SendGrid bounces it"* where
  SendGrid is not wrapped in an addon. Needs a source-and-payload shape, not a persona.
  Do not invent it off the back of a field nobody used.
- **The addon step registry.** The boundary decision (personas are people; system subjects
  are not personas) is needed now and is small. Building addon-contributed step registries
  is a separate feature that shares one insight with this one.

## Prior art in this branch

Two defects found by actually running a virtual user, both fixed, both relevant to how
much of this is guessable versus measurable:

- `expose !== true` — 34 of the e2e app's 72 functions were offered to the model and
  404'd. Catalogue 72 → 38, and 404s went 4 → 0.
- `catalogueLookup` — the model handed back rendered catalogue signatures
  (`whoAmI() -> userId,scopes`) as rpc names in 8 of 24 steps. Now forgiven.
