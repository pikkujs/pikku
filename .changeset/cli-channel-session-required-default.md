---
'@pikku/cli': patch
---

**The generated CLI channel defaults to session-required.** It was emitted with
`auth: ${auth === true}`, so it was public unless the program explicitly opted
in — inverting `wireChannel`'s own `auth !== false` default. A CLI program that
declared no auth got an unauthenticated channel exposing every command. It now
emits `auth: ${auth !== false}` and the connect-time session guard under the
same condition, so a channel is public only when the program explicitly sets
`auth: false`. CWE-306.
