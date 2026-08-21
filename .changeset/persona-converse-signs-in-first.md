---
'@pikku/core': patch
---

fix(personas): sign a persona in before it converses, not after a 401

`HttpPersona.converse` left authentication to `postAgent`'s 401-retry, which
only fires on a route that refuses an anonymous caller. An agent route wired
without `auth: true` never refuses one: turn one is accepted and the thread is
minted under a fresh anonymous id, turn two arrives under a different anonymous
id, and the persona is told the thread belongs to somebody else — intermittently,
because it depends on which turn the retry happened to run on.

The persona now logs in before the first turn if it has not already. A persona
is a declared account with real credentials in every case, so there was never a
run where conversing as nobody was what was wanted; the sign-in is the same one
`call` has always done, just no longer conditional on the server pushing back.
