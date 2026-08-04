---
'@pikku/cli': patch
'@pikku/skills': patch
---

Point the `versions check` hints at a command that exists.

Three different failures told you to run `npx pikku versions-update`. There is
no such command — `update` is a subcommand of `versions` — so anyone following
the hint hit "unknown command" at the moment they were trying to repair a
contract manifest. It now prints `npx pikku versions update`.

The pikku-versioning skill carried a paragraph warning agents the hint was
wrong; with the hint fixed, that warning is gone.
