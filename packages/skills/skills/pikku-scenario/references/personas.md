# Personas and actors

A **persona** is a kind of person; an **actor** is one body that signs in as one. Above, `support` is declared only as a persona — its actor is materialised (`support@actors.local`), so `actors.support` works without an `actors` entry. Write an actor by hand only when you need something the materialised one wouldn't have:

- a **real email or personality** for it, like `shopper`;
- a **second body of the same persona**, like `shopperB` — which is what tenant isolation, peer sharing, and "another member's row" scenarios are made of. Two actors of one persona must be two different users, so **two actors sharing an email is an error**.

A persona holds only what is true of that kind of person for the app's whole lifetime — `description`, `primary` (whose experience the product is), `kind`, `proficiency`. What someone is trying to get done, and the circumstances they are doing it in, belong to the **scenario**, not to them.

`kind: "system"` is the app acting on its own — a schedule, a cleanup, a send. It gets **no actor**: there is nobody to sign in. Give it one by hand only if it genuinely has a service account.

## Declaring personas in TypeScript

`definePersonas({ … })` is the code form of the block above, and there may be
**one call in the whole codebase** — one place to read the set from, one place
to add to it. A second anywhere, including in the same file, is a critical.
Generated files are exempt and never claim the slot.

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

An actor with no `persona` is its own persona, so a project that never declares any keeps working unchanged.

- `environments.<name>.apiUrl` is required. `signInPath` defaults to `/auth/sign-in/actor`, `rpcPath` to `/rpc`.
- **`SCENARIO_ACTOR_SECRET` is an environment variable and never goes in `pikku.config.json`.** It signs actors in. `pikku scenario run` throws without it; a server auto-building actors warns and runs without them.

## The same actors sign a human in

Declared actors are not only for automated runs. `signInPath` is Better Auth's
`actor` plugin (see `pikku-auth`, a separate install), which any caller can post to — so the
frontend gets a one-click "Sign in as …" switcher over the **same** list, and an
app can be reviewed as each kind of user without anyone knowing a seed password.

The sandbox dev server bakes both halves into the frontend from the declared
personas: `VITE_DEV_ACTORS` (the JSON actor list) and `VITE_DEV_ACTOR_SECRETS`
(`{ email: credential }`, one per persona — `SCENARIO_ACTOR_SECRET` itself never
goes in a bundle; see **pikku-auth**). Neither var is set in a production
build, so the control renders nothing there — but gate the reads on your
bundler's dev flag anyway (`import.meta.env.DEV ? … : undefined`) so no
credential reaches a production bundle in the first place.

Do not hand-roll the switcher: `useDevActors()` (`pikku-react`, a separate install) is the logic and
`<DevActorSwitcher />` from `@pikku/mantine/dev` is a ready rendering of it.
`pikku fabric validate` **requires** any frontend with a login screen to ship
one — without it a reviewer is locked out of their own sandbox.