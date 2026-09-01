---
name: pikku-auth
description: >-
  Use for anything about identity in a Pikku app — authenticating a caller (login, logout,
  sessions, cookies, bearer tokens, API keys, JWT, OAuth/social providers, MFA, Better Auth) and
  authorizing one (pikkuPermission, pikkuAuth, scopes, defineScope, global permissions). Covers
  which of the two a problem actually is, the built-in auth strategies, machine-to-machine auth
  and `pikku login`, and the JWT service. TRIGGER when: user asks about login, logout, session,
  cookie auth, bearer tokens, API keys, JWT, Better Auth, social providers, restricting who may
  call a function, resource ownership, roles, scopes, or hits MissingScopeError or
  InvalidSessionError. DO NOT TRIGGER when: user asks about middleware mechanics with no identity
  involved (use pikku-middleware) or about secrets and env vars (use pikku-services).
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
function — `scopes` and `permissions` — never checked inside its body.

A `permissions` entry that verifies a bearer token and returns `true` is
authentication wearing an authorization hat: it leaves the function sessionless,
so every body still has to work out who called it. Resolve the credential in
middleware instead.

## Pick the reference

| You are… | Read |
| --- | --- |
| Restricting who may call a function — ownership, roles, scopes | `references/permissions.md` |
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

## The three gates

Authorization is three independent gates, all of which must pass, in this order:

1. **Scopes** (`scopes`) — AND'd, checked before input validation, fails closed.
2. **Global permissions** (`addGlobalPermission`) — AND'd, an app-wide baseline.
3. **The function's own `permissions`** — OR'd groups of AND'd entries.

They are independent: a broad global gate can never satisfy a function's own
requirement, and a scope can only ever narrow access, never grant it.

## What NOT to do

- **Do not check authorization inside `func`.** The `permissions` field is
  visible to the inspector; a check in the body is invisible to `pikku info
  permissions` and to an audit. The one sanctioned exception is
  `permissionsInBody`, which is purely declarative — see
  `references/permissions.md`.
- **Do not write an "is signed in" permission.** `auth: true` (the default on
  `pikkuFunc`) already requires the session. A checker returning `!!session`
  gates nothing.
- **Do not put `scopes` on a `pikkuSessionlessFunc`.** Scopes fail closed and an
  anonymous caller holds none, so it would reject every caller it exists to
  serve. Gate those with `permissions`, which receive an optional session.
- **Do not expect the built-in strategies to authenticate a non-HTTP caller.**
  `authBearer`, `authCookie` and `authAPIKey` all step aside when there is no
  HTTP request — a queue job, a scheduled task or a channel message needs its
  session set another way.
- **Do not share one header between the human and machine paths.**
  `Authorization: Bearer` is the human session; `x-api-key` is the machine key.
  Merging them reintroduces the ambiguity the split exists to remove.
- **Do not reach for wire-, tag- or route-level permissions.** They were removed
  in #972. Permissions live on the function, plus the optional global gate; tags
  are organizational only.
