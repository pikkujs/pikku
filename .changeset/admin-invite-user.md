---
'@pikku/addon-admin': patch
---

New `admin:inviteUser` `{ email, name?, role? }` → `{ userId, created }`, gated by `admin:users:create`: trims and lowercases the email, creates the account without a password when there is none (reusing an existing one), mails a sign-in link through the `magicLink()` plugin, then grants `role`. A role needs `admin:scopes:manage` and must exist, both checked before anything is created. Calling it again sends a new link and grants the role if it is not yet held. Refusals are registered errors whose message starts with `USER_BANNED` (422), `UNKNOWN_ROLE` (400) or `MAIL_FAILED` (422; the account is kept and no role is granted, and a missing `magicLink()` plugin keeps better-auth's wording after the code).
