# Personas and actors

A **persona** is a person your product is for; an **actor** is one body that signs in as them. Every entry materialises exactly one actor, so `actors.<id>` exists for each declared persona and there is no second way to declare a login.

- Two people of the same kind are two entries, not one persona with two logins — "you see yours, not theirs" is only testable with two customers.
- Never write an email address: each is derived from the persona id and `scenarios.emailDomain`, and a hand-written one signs in as somebody who was never created.
- `roles` is typechecked against `defineSystemRole`; an undeclared role is a build error.
- A person who is only ever acted *upon* — the account an admin bans — sets `runnable: false`: declared and seeded, never signed in, because a run as them would race the scenario that acts on them.
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

## The same actors sign a human in

Declared actors are not only for automated runs. `signInPath` is Better Auth's
`actor` plugin (see `pikku-auth`, a separate install), which any caller can post to — so the
frontend gets a one-click "Sign in as …" switcher over the **same** list, and an
app can be reviewed as each kind of user without anyone knowing a seed password.

The dev server bakes both halves into the frontend from the declared
personas — the sandbox's, or the template's `bun run dev`, never `pikku dev`: `VITE_DEV_ACTORS` (the JSON actor list) and `VITE_DEV_ACTOR_SECRETS`
(`{ email: credential }`, one per persona — `SCENARIO_ACTOR_SECRET` itself never
goes in a bundle; see **pikku-auth**). Neither var is set in a production
build, so the control renders nothing there — but gate the reads on your
bundler's dev flag anyway (`import.meta.env.DEV ? … : undefined`) so no
credential reaches a production bundle in the first place.

Do not hand-roll the switcher: `useDevActors()` (`pikku-react`, a separate install) is the logic and
`<DevActorSwitcher />` from `@pikku/mantine/dev` is a ready rendering of it.
`pikku fabric validate` **requires** any frontend with a login screen to ship
one — without it a reviewer is locked out of their own sandbox.
When the switcher is missing, it is one of three things, and none of them
errors:

- **The frontend was not started by the dev script.** The two `VITE_DEV_*` vars
  are computed by `bun run dev` and read by vite once, at boot. A bare `vite dev`
  — including one restarted by hand — has an empty list and renders nothing.
- **`SCENARIO_ACTOR_SECRET` is not in `.env`.** No root secret, no per-persona
  credentials, and the switcher filters out every actor it cannot sign in.
- **It is not mounted on the page you are looking at.** The template mounts it
  on the login screen. A public homepage that replaces the `/` → `/app`
  redirect needs its own `<DevActorSwitcher />` in the public layout.

When the switcher is there but signing in fails with `401 Invalid actor
secret`, check which server answered before checking the secret: a frontend
whose dev proxy (`VITE_API_PROXY`, default `http://localhost:3000`) points at
another project's API sends the sign-in there.

**A runner of your own that starts vite has to bake them itself**, from the
generated persona meta (`<outDir>/workflow/personas.gen.json`, which already
carries the derived `email`):

```js
const personas = Object.values(JSON.parse(readFileSync(personasPath, 'utf8')))

env.VITE_DEV_ACTORS = JSON.stringify(
  personas.map(({ id, email, name, jobTitle }) => ({
    key: id,
    email,
    name,
    jobTitle: jobTitle ?? '',
  }))
)
env.VITE_DEV_ACTOR_SECRETS = JSON.stringify(
  Object.fromEntries(
    await Promise.all(
      personas.map(async ({ email }) => [
        email,
        await deriveActorSecret(env.SCENARIO_ACTOR_SECRET, email),
      ])
    )
  )
)
```

**Set `SCENARIO_ACTOR_SECRET` yourself**, at least 32 characters, in the
environment both processes read. Left unset, `pikku dev` mints an ephemeral root
for its own run that a separately spawned vite cannot see, so the two derive
from different roots: the switcher renders every persona and each click is
refused, which reads as a broken login rather than missing configuration. On a
brand-new project the persona file does not exist until the first `pikku dev`
codegen, after vite has baked an empty list — watch it and restart the frontend
when it changes.
