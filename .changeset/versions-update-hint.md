---
'@pikku/cli': patch
'@pikku/skills': patch
---

Point `versions check` at a command that exists.

Three of its diagnostics told you to run `npx pikku versions-update`. There is
no such command — `update` is a subcommand of `versions`, so following the hint
gets an unknown-command error at the exact moment you have a failing check to
clear. They now print `npx pikku versions update`.

The pikku-versioning skill carried a paragraph warning agents off the bad hint.
With the hint corrected the warning is the only thing left naming a command that
does not exist, so it goes too.
