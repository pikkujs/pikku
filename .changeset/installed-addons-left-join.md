---
'@pikku/console': patch
---

Fix the addons "Installed" filter to list every addon the project has actually
wired, not just catalogue entries that happen to be installed. It previously
intersected the remote gallery with the installed set, so a local, private, or
otherwise unpublished addon — one returned by `console:getInstalledAddons` but
absent from the catalogue — never appeared under Installed. It is now a
left-join on the installed set: catalogue metadata is used when available, and a
minimal card is synthesised otherwise.
