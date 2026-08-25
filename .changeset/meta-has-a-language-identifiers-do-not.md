---
'@pikku/cli': patch
---

`pikku.config.json` takes a `locale`, naming the language the project's meta is
written in.

Meta is the human-readable prose authored inside the code rather than in a
message catalogue: `description` on functions and steps, `name`/`title` on
features and scenarios, step `template` strings, role and persona descriptions.
It is also the one part of a project the Pikku Console renders back to a human,
which is what the field is for — a team whose working language is German should
be able to read their own Console in German without anything else about the
project changing.

This release is the groundwork: the field is read, validated and canonicalized,
and the skills explain which of a project's three languages it is. Nothing
consumes it yet, so setting it does not change what the Console renders — that
comes with the reader.

It defaults to `en`, is validated as a BCP-47 tag through
`Intl.getCanonicalLocales` (so `de_DE` fails at the line that is wrong rather
than degrading to "some language" three layers down), and comes back
canonicalized so `EN-gb` and `en-GB` are one value downstream.

Two things it deliberately does not do, because collapsing them is the bug this
came from. It never renames anything — identifiers, files, database tables and
columns stay English whatever it says. And it is not the product's UI language:
what the app says to its users lives in `messages/<locale>.json`, with
`active.json`'s `defaultLocale` deciding what a first-time visitor is served,
while `baseLocale` names the message source and stays `en`.
