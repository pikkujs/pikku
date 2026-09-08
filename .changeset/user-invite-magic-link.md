---
'@pikku/better-auth': patch
'@pikku/addon-admin': patch
'@pikku/console': patch
---

Invite a user instead of choosing a password for them. `admin:createUser` no longer requires a password — an account created without one has no credential row, so it cannot be signed into — and a new `admin:sendSignInLink` mails that user a magic link. With `magicLink({ disableSignUp: true })` a link only ever admits an email that already has a user row, which makes sending one the invitation. The console's create panel sends the link by default (forced when no password is set) and the row menu can send another, both gated on `admin:users:create`.
