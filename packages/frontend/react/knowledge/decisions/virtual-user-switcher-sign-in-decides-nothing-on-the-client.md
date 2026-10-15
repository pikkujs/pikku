---
type: decision
title: The React virtual user switcher makes no access decision; the server gate decides who can sign in
description: The client helpers send only a virtual user id and render whatever list comes back, while the server refuses switcher sign-in unless its gate is open and only offers declared, sign-inable virtual users
tags: frontend, react, sign-in, virtual-users
---

# The React virtual user switcher makes no access decision; the server gate decides who can sign in

The module doc describes a virtual user as "No address and no credential: sign-in names the virtual user by id and the server resolves the rest" (`packages/frontend/react/src/dev-virtual-users.ts:3-7`).

**Sign-in.** `signInAsVirtualUser` posts `{ id }` to `/auth/sign-in/switch-virtual-user` with `credentials: 'include'` (`dev-virtual-users.ts:32-37`). Its doc says the server decides: `pikkuVirtualUser({ virtualUserSignIn })` refuses unless its gate is open, and only ever signs in rows flagged `virtualUser: true` (`dev-virtual-users.ts:24-26`). A non-OK response only throws,.

**Listing.** `listDevVirtualUsers` returns `[]` when the response is not OK (`dev-virtual-users.ts:59`).

**The server side, which holds the decisions** (`packages/services/better-auth/src/virtual-user-plugin.ts`):

- `GET /sign-in/virtual-users` returns `[]` unless `gate.enabled` and `virtualUserAllowed()` both hold.
- `POST /sign-in/switch-virtual-user` throws `UNAUTHORIZED` under the same condition. Then the id must match a declared virtual user that is `isSignInable`, or the call is `NOT_FOUND`.
- Where the gate does not allow provisioning (a deployed stage rather than pikku dev), the same endpoint also requires a signed `statement` naming that virtual user, and refuses without one. The React helper never sends a statement, so on a stage the switcher's sign-in is refused by the server.
- `virtualUserAllowed` uses the app's `virtualUserSignIn.allowed` when it is given, and otherwise `devSwitcherOn` (`packages/services/better-auth/src/dev-virtual-users.ts`).

The gate's rules for a deployed stage, and why only pikku dev may create the accounts a virtual user signs in as, are in [Only pikku dev may create virtual user accounts](../../../../services/better-auth/knowledge/decisions/only-pikku-dev-may-create-virtual-user-accounts.md). The feature-flag map in the same package follows the same pattern, described in [Client-side flag reads are advisory; the server re-checks availability on every call](client-side-flag-reads-are-advisory.md).

**What this rules out:** using the switcher's list, or hiding the button, as the control on who may sign in as a virtual user. It also rules out adding a check in the React client to make sign-in safe. A client that posts an id the server does not offer is refused by the plugin's `switch-virtual-user` endpoint.
