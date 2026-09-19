---
'@pikku/core': patch
'@pikku/inspector': patch
---

A channel's `auth` flag now reaches its meta. The inspector already read it to mark the connect and disconnect functions sessionless, then dropped it, so nothing downstream could tell a public channel from a private one without reading the generated source.

That matters in front of the channel rather than inside it. A `wireCLI({ auth: false })` program is reachable by anyone holding its address; a router or deploy that cannot see the flag either guesses or demands a token in front of a surface it was never protecting, locking out the clients the program was opened for.

The flag is only recorded when the channel actually said. A channel that never mentioned `auth` leaves it absent rather than claiming a default it did not declare, which the runtime continues to read as requiring a session.
