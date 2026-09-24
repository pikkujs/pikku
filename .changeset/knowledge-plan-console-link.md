---
'@pikku/cli': patch
'@pikku/console': patch
---

The console's knowledge page keeps the open note in `?id=`, so a note or a milestone plan can be linked to. For example, `/console/knowledge?id=milestones/01-foo.plan.json` opens that milestone with its plan. `pikku knowledge plan set`, `show` and `progress` print that link, and add it to their JSON output as `consoleUrl`. The link uses the running `pikku dev` server's address when there is one, and `http://localhost:3000` otherwise.
