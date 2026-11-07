---
'@pikku/better-auth': patch
'@pikku/cli': patch
---

Document how a function invites a user. `pikku doc pikkuBetterAuth` now says functions reach the instance as `services.auth`, explains inviting with `createAuthUser` then `sendAuthUserSignInLink` (mailed through the app's own `sendMagicLink`), and shows a second example, `betterAuthInvite`. The TSDoc on `sendAuthUserSignInLink` is corrected: the magic-link plugin does not refuse an unknown address when sending, only when the link is clicked. The docs also name the pitfalls: a call from a function needs `baseURL` configured, `callbackURL` must be a path or a trusted origin, and the five-minute default expiry is too short for an invite.
