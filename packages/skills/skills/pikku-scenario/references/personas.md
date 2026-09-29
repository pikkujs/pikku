# Personas and actors

A **persona** is a person your product is for; an **actor** is one body that signs in as them. Every entry materialises exactly one actor, so `actors.<id>` exists for each declared persona and there is no second way to declare a login.

- Two people of the same kind are two entries, not one persona with two logins — "you see yours, not theirs" is only testable with two customers.
- Never write an email address: each is derived from the persona id and `scenarios.emailDomain`, and a hand-written one signs in as somebody who was never created.
- `roles` is typechecked against `defineSystemRole`; an undeclared role is a build error.
- A person who is only ever acted _upon_ — the account an admin bans — sets `runnable: false`: declared and seeded, never signed in, because a run as them would race the scenario that acts on them.
- A persona holds only what is true of that kind of person for the app's whole lifetime (`name`, `jobTitle`, `description`, `personality`, `roles`, `goals`, `disposition`). What someone is trying to get done, and the circumstances they are doing it in, belong to the **scenario**, not to them.

## Declaring personas in TypeScript

There may be **one `definePersonas` call in the whole codebase** — one place to
read the set from, one place to add to it. A second anywhere, including in the
same file, is a critical. Generated files are exempt and never claim the slot.

> [!WARNING]
> The declaration is **read from source, never evaluated** — the CLI writes it
> to JSON that a deployed stage carries without the app. So every value has to
> be statically knowable, and a value that is not comes out as `undefined`
> rather than as an error. Only `name` is checked, so a computed `personality`,
> `jobTitle` or `description` is dropped in silence and the persona runs with a
> blank temperament.

What that admits and what it does not:

```typescript
personality: 'Wound up and short with it.' // read
personality: `Wound up and short with it.
  Says what she wants in a few blunt words.` // read — no ${} in it
personality: 'Wound up. ' + 'Short with it.' // dropped, silently
personality: TEMPERAMENTS.impatient // dropped, silently
```

A no-substitution template literal is a string literal as far as the reader is
concerned, so it is the way to write a long personality across several lines —
not a concatenation, and not a `prettier-ignore`d single line. Its newlines and
leading indentation are kept verbatim and reach the model that way, which is
harmless but worth knowing before you align it to the surrounding code.

One more thing worth knowing before writing a rich persona: **`actor.converse`
builds its prompt from `name`, `jobTitle`, `personality` and the scenario's
`task` only.** Fields like `disposition`, `goals` and `roles` are read and
stored, and the console shows them, but they do not reach the conversing
persona's instructions. Anything that must shape how someone talks belongs in
`personality` or in the task.

A project that never declares a persona keeps working: a scenario that names no actor needs none.

- `environments.<name>.apiUrl` is required. `signInPath` defaults to `/auth/sign-in/actor`, `rpcPath` to `/rpc`.
- **`SCENARIO_ACTOR_SECRET` is an environment variable and never goes in `pikku.config.json`.** It signs actors in. `pikku scenario run` throws without it; a server auto-building actors warns and runs without them.

## Actors that call a third-party API

An addon generated from an upstream API (Dolibarr, a CRM, a calendar) calls it
with the signed-in user's own credential. An actor has none until one is stored
for it, so every step that reaches the addon fails with `No <X> session`. Give
the `actor` plugin a `credentials` option, and each actor carries its upstream
credential into every session:

- `names: ['dolibarr']` — the credentials to carry
- `store: (name, value, userId) => credentialService.set(name, value, userId)`
- `remove: (name, userId) => credentialService.delete(name, userId)`

At each actor sign-in the plugin reads `ACTOR_CREDENTIAL_<PERSONA>_<NAME>` —
`dan` + `dolibarr` is `ACTOR_CREDENTIAL_DAN_DOLIBARR` — and stores it with
`credentialService.set` for that actor. A bare value is stored as `{ token }`
(what a delegated or bearer credential holds); a JSON object is stored as-is,
e.g. `{"apiKey":"…"}` for an API-key credential. Unset means the actor has no
upstream credential: `remove` drops one stored at an earlier sign-in.

- **Values live in `.env` (or CI secrets), never in `personas.ts` or code.**
  Use a dedicated upstream test account per persona, not a real person's.
- `read` defaults to `process.env`; a Worker passes `(key) => variables.get(key)`.
- A malformed JSON value refuses the sign-in with a 500 that names the variable.
- A delegated token expires upstream like any other; re-signing the actor
  in re-stores whatever the variable holds now.

## The same actors sign a human in

Declared actors are not only for automated runs. `signInPath` is Better Auth's
`actor` plugin (see `pikku-auth`, a separate install), which any caller can post to — so the
frontend gets a one-click "Sign in as …" switcher over the **same** list, and an
app can be reviewed as each kind of user without anyone knowing a seed password.

The switcher holds no credential. It asks the app's `listDevActors` function
for the personas to offer and signs in by posting only a persona id to
`/auth/sign-in/persona`; the server resolves the address. Two server pieces,
both built from `@pikku/better-auth`:

```ts
// an exposed, sessionless function
export const listDevActors = pikkuSessionlessFunc({
  expose: true,
  input: z.object({ app: z.string().optional() }),
  output: ListDevActorsOutput,
  func: async ({ variables, featureFlags }, { app }) => {
    const optIn = await variables.get(ACTOR_SIGN_IN_OPT_IN_ENV)
    if (!(await devSwitcherOn(featureFlags, optIn))) return { actors: [] }
    return { actors: listDevActors(personaList, app) }
  },
})

// in the auth config
pikkuActor({
  secret: SCENARIO_ACTOR_SECRET,
  allowSignIn: ALLOW_ACTOR_SIGN_IN,
  personaSignIn: {
    personas: personaList,
    allowed: () => devSwitcherOn(featureFlags, ALLOW_ACTOR_SIGN_IN),
  },
})
```

`devSwitcherOn` is always true under `pikku dev`. A deployed stage needs actor
sign-in opted in **and** its `devSwitcher` feature flag on; production never
has the opt-in, so it lists nobody and refuses every persona sign-in.

Do not hand-roll the switcher: `useDevActors()` (`pikku-react`, a separate install) is the logic and
`<DevActorSwitcher />` from `@pikku/mantine/dev` is a ready rendering of it.
`pikku fabric validate` **requires** any frontend with a login screen to ship
one — without it a reviewer is locked out of their own sandbox.
When the switcher is missing, it is one of three things, and none of them
errors:

- **`listDevActors` returns nobody.** On a deployed stage that is the gate
  doing its job — check the opt-in and the `devSwitcher` flag. Locally, check
  the personas declare an `email` (via `scenarios.emailDomain`) and are not
  `runnable: false`.
- **The function is not exposed, or the frontend calls another API.** A dev
  proxy (`VITE_API_PROXY`, default `http://localhost:3000`) that points at
  another project's API lists that project's personas, or none.
- **It is not mounted on the page you are looking at.** The template mounts it
  on the login screen. A public homepage that replaces the `/` → `/app`
  redirect needs its own `<DevActorSwitcher />` in the public layout.

When the switcher lists personas but every click 404s, the auth config is
missing `personaSignIn`; a 401 means its `allowed()` disagrees with the gate
`listDevActors` used — pass both the same `devSwitcherOn` call.
