---
type: decision
title: Only pikku dev may create virtual user accounts
description: A deployed stage that opens virtual user sign-in can sign in only as virtual users already provisioned there, because minting a new virtual user row is allowed only under pikku dev
tags: better-auth, virtual-users, sign-in
---

# Only pikku dev may create virtual user accounts

`resolveVirtualUserSignIn` (`virtual-user-sign-in-gate.ts`) returns a
`mayProvision` flag, true only when `PIKKU_DEV_VIRTUAL_USER_SIGN_IN` is `true`.
The doc comment on the field says "a stage that runs scenarios signs in as the
virtual users the deployment provisioned when it started, and never mints new
identities."

In `pikkuVirtualUser`'s `signIn` (`virtual-user-plugin.ts`), which all three
sign-in endpoints end in:

- **No row, no provisioning.** An unknown address with `mayProvision` false is
  refused with `VIRTUAL_USER_NOT_PROVISIONED_MESSAGE`, which tells the reader to
  check the virtual users were declared in this environment.
- **Real users are refused.** An existing row without the `virtualUser` flag is
  refused as "User is not a virtual user," whatever the gate says.
- **New rows are virtual user rows.** Created with `virtualUser: true` and
  `emailVerified: true`.

The "Sign in as …" switcher has its own check, `devSwitcherOn`
(`dev-virtual-users.ts`). It is on when the gate is enabled and either
`mayProvision` is true or the `devSwitcher` feature flag is on. A deployed stage
therefore needs both the opt-in and the flag, and there the switch endpoint also
requires a signed statement naming the same virtual user.

**What this rules out:** creating identities on a deployed stage through the
virtual user endpoints, and sign-in creating or altering real users.
