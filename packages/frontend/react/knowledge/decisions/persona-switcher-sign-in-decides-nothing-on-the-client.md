---
type: decision
title: The React persona switcher makes no access decision; the server gate decides who can sign in
description: The client helpers send only a persona id and render whatever list comes back, while the server refuses persona sign-in unless its gate is open and only offers actor-flagged personas
tags: frontend, react, actor, sign-in, personas
---

# The React persona switcher makes no access decision; the server gate decides who can sign in

The module doc describes a persona as "No address and no credential: sign-in names the persona by id and the server resolves the rest" (`packages/frontend/react/src/dev-actors.ts:3-7`).

**Sign-in.** `signInAsPersona` posts `{ id }` to `/auth/sign-in/persona` with `credentials: 'include'` (`dev-actors.ts:32-36`). Its doc says the server decides: `pikkuActor({ personaSignIn })` refuses unless its gate is open, and "only ever signs in rows flagged `actor: true`" (`dev-actors.ts:24-26`). A non-OK response only throws, and the hook keeps the message as `error` (`dev-actors.ts:38-40`).

**Listing.** `listDevActors` returns `[]` when the response is not OK (`dev-actors.ts:59`). The hook's own doc says the list is empty "whenever the server offers none — render nothing" (`dev-actors.ts:69`).

**The server side, which holds the decisions:**

- The listing returns `[]` unless `gate.enabled` and `personaAllowed()` both hold (`packages/services/better-auth/src/actor-plugin.ts:291-296`).
- Sign-in throws `UNAUTHORIZED` under the same condition (`actor-plugin.ts:304-309`). Then the id must match a persona that is `isSignInable`, or the call is `NOT_FOUND` (`actor-plugin.ts:310-318`).
- `personaAllowed` uses the app's `personaSignIn.allowed` when it is given, and otherwise `devSwitcherOn` (`actor-plugin.ts:156-159`). `devSwitcherOn` is in `packages/services/better-auth/src/dev-actors.ts:16-23`.

The gate's rules for a deployed stage, and why only pikku dev may create the actor rows a persona signs in as, are in [Only pikku dev may create actor accounts](../../../../services/better-auth/knowledge/decisions/only-pikku-dev-may-create-actor-accounts.md). The feature-flag map in the same package follows the same pattern, described in [Client-side flag reads are advisory; the server re-checks availability on every call](client-side-flag-reads-are-advisory.md).

**What this rules out:** using the switcher's list, or hiding the button, as the control on who may sign in as a persona. It also rules out adding a check in the React client to make sign-in safe. A client that posts an id the server does not offer is refused by `actor-plugin.ts:305-318`.
