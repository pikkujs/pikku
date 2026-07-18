---
'@pikku/console': patch
---

Make the addons UI surface an installed addon's setup requirements:

- The "Installed" filter now lists every addon the project has actually wired,
  not just catalogue entries that happen to be installed. It previously
  intersected the remote gallery with the installed set, so a local, private,
  or unpublished addon — returned by `console:getInstalledAddons` but absent
  from the catalogue — never appeared. It is now a left-join on the installed
  set: catalogue metadata is used when available, a minimal card otherwise.
- Opening an installed addon now routes to its full detail page (which carries
  the Setup tab: OAuth integrations + secrets the addon needs, with connect/set
  actions) instead of the lightweight browse drawer. Not-yet-installed addons
  still open the drawer to preview before installing.
