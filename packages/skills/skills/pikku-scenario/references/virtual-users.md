# Virtual users and virtual users

## Contents

- [Declaring virtual users in TypeScript](#declaring-virtual-users-in-typescript)
- [Virtual users that call a third-party API](#virtual-users-that-call-a-third-party-api)
- [The same virtual users sign a human in](#the-same-virtual-users-sign-a-human-in)

A **virtual user** is a person your product is for; an **virtual user** is one body that signs in as them. Every entry materialises exactly one virtual user, so `virtualUsers.<id>` exists for each declared virtual user and there is no second way to declare a login.

- Two people of the same kind are two entries, not one virtual user with two logins — "you see yours, not theirs" is only testable with two customers.
- Never write an email address: each is derived from the virtual user id and `scenarios.emailDomain`, and a hand-written one signs in as somebody who was never created.
- `roles` is typechecked against `defineSystemRole`; an undeclared role is a build error.
- A person who is only ever acted _upon_ — the account an admin bans — sets `runnable: false`: declared and seeded, never signed in, because a run as them would race the scenario that acts on them.
- A virtual user holds only what is true of that kind of person for the app's whole lifetime (`name`, `jobTitle`, `description`, `personality`, `roles`, `goals`, `disposition`). What someone is trying to get done, and the circumstances they are doing it in, belong to the **scenario**, not to them.

## Declaring virtual users in TypeScript

There may be **one `defineVirtualUsers` call in the whole codebase** — one place to
read the set from, one place to add to it. A second anywhere, including in the
same file, is a critical. Generated files are exempt and never claim the slot.

> [!WARNING]
> The declaration is **read from source, never evaluated** — the CLI writes it
> to JSON that a deployed stage carries without the app. So every value has to
> be statically knowable, and a value that is not comes out as `undefined`
> rather than as an error. Only `name` is checked, so a computed `personality`,
> `jobTitle` or `description` is dropped in silence and the virtual user runs with a
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

One more thing worth knowing before writing a rich virtual user: **`virtualUser.converse`
builds its prompt from `name`, `jobTitle`, `personality` and the scenario's
`task` only.** Fields like `disposition`, `goals` and `roles` are read and
stored, and the console shows them, but they do not reach the conversing
virtual user's instructions. Anything that must shape how someone talks belongs in
`personality` or in the task.

A project that never declares a virtual user keeps working: a scenario that names no virtual user needs none.

- `environments.<name>.apiUrl` is required. `signInPath` defaults to `/auth/sign-in/virtual-user`, `rpcPath` to `/rpc`.
- **The signing key never goes in `pikku.config.json`.** `pikku dev` creates one under `.pikku-runtime/virtual-user/`; a deployed stage's deployer holds `VIRTUAL_USER_SIGNING_KEY`. `pikku scenario run` throws without a key.

## Virtual users that call a third-party API

An addon generated from an upstream API (Dolibarr, a CRM, a calendar) calls it
with the signed-in user's own credential. A virtual user has none until one is stored
for it, so every step that reaches the addon fails with `No <X> session`. Give
the `virtualUser` plugin a `credentials` option, and each virtual user carries its upstream
credential into every session:

- `names: ['dolibarr']` — the credentials to carry
- `store: (name, value, userId) => credentialService.set(name, value, userId)`
- `remove: (name, userId) => credentialService.delete(name, userId)`

At each virtual user sign-in the plugin reads `VIRTUAL_USER_CREDENTIAL_<VIRTUAL_USER>_<NAME>` —
`dan` + `dolibarr` is `VIRTUAL_USER_CREDENTIAL_DAN_DOLIBARR` — and stores it with
`credentialService.set` for that virtual user. A bare value is stored as `{ token }`
(what a delegated or bearer credential holds); a JSON object is stored as-is,
e.g. `{"apiKey":"…"}` for an API-key credential. Unset means the virtual user has no
upstream credential: `remove` drops one stored at an earlier sign-in.

- **Values live in `.env` (or CI secrets), never in `virtual-users.ts` or code.**
  Use a dedicated upstream test account per virtual user, not a real person's.
- `read` defaults to `process.env`; a Worker passes `(key) => variables.get(key)`.
- A malformed JSON value refuses the sign-in with a 500 that names the variable.
- A delegated token expires upstream like any other; re-signing the virtual user
  in re-stores whatever the variable holds now.

## The same virtual users sign a human in

Declared virtual users are not only for automated runs. `signInPath` is Better Auth's
`virtualUser` plugin (see `pikku-auth`, a separate install), which any caller can post to — so the
frontend gets a one-click "Sign in as …" switcher over the **same** list, and an
app can be reviewed as each kind of user without anyone knowing a seed password.

The switcher holds no credential. It lists virtual users from
`/auth/sign-in/virtual-users` and signs in by posting only a virtual user id to
`/auth/sign-in/virtual-user`; the server resolves the address. One server piece
serves both, in the auth config:

```ts snippet:virtualUserSignIn

```

It is always open under `pikku dev`. A deployed stage needs virtual user
sign-in opted in **and** its `devSwitcher` feature flag on; production never
has the opt-in, so it lists nobody and refuses every virtual user sign-in.

Do not hand-roll the switcher: `useDevVirtualUsers()` (`pikku-react`, a separate install) is the logic and
the starter template's `<DevVirtualUserSwitcher />` is a ready rendering of it.
`pikku cloud validate` **requires** any frontend with a login screen to ship
one — without it a reviewer is locked out of their own sandbox.
When the switcher is missing, it is one of three things, and none of them
errors:

- **The list is empty.** On a deployed stage that is the gate
  doing its job — check the opt-in and the `devSwitcher` flag. Locally, check
  the virtual users declare an `email` (via `scenarios.emailDomain`) and are not
  `runnable: false`.
- **`virtualUserSignIn` is missing, or the frontend calls another API.** A dev
  proxy (`VITE_API_PROXY`, default `http://localhost:3000`) that points at
  another project's API lists that project's virtual users, or none.
- **It is not mounted on the page you are looking at.** The template mounts it
  on the login screen. A public homepage that replaces the `/` → `/app`
  redirect needs its own `<DevVirtualUserSwitcher />` in the public layout.

When the switcher lists virtual users but a click 404s, that virtual user has no `email`
or is `runnable: false`.
