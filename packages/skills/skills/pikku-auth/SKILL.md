---
name: pikku-auth
description: >-
  Identity: login, sessions, cookies, bearer tokens, API keys, JWT, OAuth, MFA, Better Auth, machine callers, `pikku login`, InvalidSessionError. Who may call a function is pikku-permissions.
installGroups: [core]
---

# Pikku Auth

For how to call it, run this once: `pikku doc auth scopes authBearer authCookie authAPIKey`.
This skill is the part the compiler cannot tell you: which of
the two problems you actually have, and what goes wrong in each.

## First: authentication or authorization?

They are separate gates, and confusing them is the most common mistake in a
Pikku app.

**Authentication** answers _who is calling_. It happens in middleware, before the
function runs, and ends in a call to `setInitialSession`.

**Authorization** answers _may this caller do this_. It is declared on the
function — `scopes` and `permissions` — never checked inside its body. All of it is
covered by the pikku-permissions skill.

A `permissions` entry that verifies a bearer token and returns `true` is
authentication wearing an authorization hat: it leaves the function sessionless,
so every body still has to work out who called it. Resolve the credential in
middleware instead.

## Pick the reference

| You are…                                                                         | Read                         |
| -------------------------------------------------------------------------------- | ---------------------------- |
| Restricting who may call a function — ownership, roles, scopes                   | the pikku-permissions skill  |
| Reading or setting the session, or wiring `authBearer`/`authCookie`/`authAPIKey` | `references/sessions.md`     |
| Standing up user sign-in — OAuth, email+password, MFA, organizations             | `references/better-auth.md`  |
| Authenticating a CLI, agent, sandbox or worker — API keys, `pikku login`         | `references/machine-auth.md` |
| Configuring the JWT service, or rotating a signing secret                        | `references/jose.md`         |

## All authentication goes through `@pikku/better-auth`

There is no second auth story. A hand-rolled user table, a bespoke password
hash, a custom OAuth dance — all of them are the wrong answer, and nothing else
in Pikku will work against them. `references/better-auth.md` has the setup; the
built-in strategies in `references/sessions.md` are how a resolved credential
becomes a Pikku session, not a replacement for it.

Inviting someone: `createAuthUser` with no password, then `sendAuthUserSignInLink`, from `@pikku/better-auth`. The link is the invitation: no throwaway password, no hashing, no invitations table, and no reading better-auth's source.

- Trim the email once (`email.trim()`) and pass the same value to both: `createAuthUser` lowercases but keeps whitespace, while the link trims, so they can disagree.
- It needs `magicLink({ sendMagicLink, disableSignUp: true })` wired in better-auth, with `sendMagicLink` mailing the link. `disableSignUp: true` keeps it invitation-only.
- `createAuthUser` refuses an existing email, so for an existing account, or to retry a failed send, call `sendAuthUserSignInLink` alone.
- The link signs the person in. It does not add them to an organization: use better-auth's organization invitation for that.

## What NOT to do

- **Do not expect the built-in strategies to authenticate a non-HTTP caller.**
  `authBearer`, `authCookie` and `authAPIKey` all step aside when there is no
  HTTP request — a queue job, a scheduled task or a channel message needs its
  session set another way.
- **Do not share one header between the human and machine paths.**
  `Authorization: Bearer` is the human session; `x-api-key` is the machine key.
  Merging them reintroduces the ambiguity the split exists to remove.
- **Do not write authorization here.** Ownership, roles, scopes and global
  permissions belong in the `permissions`/`scopes` fields; see pikku-permissions.
