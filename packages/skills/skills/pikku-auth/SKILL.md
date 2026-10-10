---
name: pikku-auth
description: >-
  Use for identity in a Pikku app: authenticating a caller (login, logout, sessions, cookies,
  bearer tokens, API keys, JWT, OAuth/social providers, MFA, Better Auth, machine callers,
  `pikku login`). Covers telling authentication from authorization, the built-in strategies and
  the JWT service. Authorization rules (ownership, roles, scopes, global permissions) live in
  pikku-permissions. TRIGGER when: user asks about login, logout, session, cookie auth, bearer
  tokens, API keys, JWT, Better Auth, social providers, how a CLI/agent/sandbox authenticates,
  or hits InvalidSessionError. DO NOT TRIGGER when: the question is who may call a function,
  such as ownership, roles, per-row checks, scopes or MissingScopeError (use pikku-permissions),
  middleware mechanics with no identity involved (use pikku-middleware), or secrets and env
  vars (use pikku-services).
installGroups: [core]
---

# Pikku Auth

Signatures and option keys come from `pikku doc` — run `pikku doc --ai` for the
installed surface. This skill is the part the compiler cannot tell you: which of
the two problems you actually have, and what goes wrong in each.

## First: authentication or authorization?

They are separate gates, and confusing them is the most common mistake in a
Pikku app.

**Authentication** answers _who is calling_. It happens in middleware, before the
function runs, and ends in a call to `setSession`.

**Authorization** answers _may this caller do this_. It is declared on the
function — `scopes` and `permissions` — never checked inside its body. All of it is
covered by the pikku-permissions skill.

A `permissions` entry that verifies a bearer token and returns `true` is
authentication wearing an authorization hat: it leaves the function sessionless,
so every body still has to work out who called it. Resolve the credential in
middleware instead.

## Pick the reference

| You are… | Read |
| --- | --- |
| Restricting who may call a function — ownership, roles, scopes | the pikku-permissions skill |
| Reading or setting the session, or wiring `authBearer`/`authCookie`/`authAPIKey` | `references/sessions.md` |
| Standing up user sign-in — OAuth, email+password, MFA, organizations | `references/better-auth.md` |
| Authenticating a CLI, agent, sandbox or worker — API keys, `pikku login` | `references/machine-auth.md` |
| Configuring the JWT service, or rotating a signing secret | `references/jose.md` |

## All authentication goes through `@pikku/better-auth`

There is no second auth story. A hand-rolled user table, a bespoke password
hash, a custom OAuth dance — all of them are the wrong answer, and the console
will not work against them. `references/better-auth.md` has the setup; the
built-in strategies in `references/sessions.md` are how a resolved credential
becomes a Pikku session, not a replacement for it.

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
