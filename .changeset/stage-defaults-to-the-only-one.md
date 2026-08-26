---
'@pikku/cli': patch
---

`fabric` stage commands default to the only stage, and say what is missing when they cannot

`pikku fabric secrets list` with one stage deployed failed with `No stage for
branch "undefined". Existing: main` — an error interpolating the missing
argument's value directly above a line naming the single stage it could have
used.

With exactly one stage there is nothing to disambiguate, so `secrets
list/set/rotate` and `variables get/set` now use it. With several, the error
says `--branch is required` and lists them; with none, it says nothing is
deployed yet. Each command also names the stage it acted on rather than echoing
the argument, and `secrets rotate` resolves before it refuses, so the one
message standing between a typo and unreadable secrets names the stage that
would actually be rotated.
