---
type: decision
title: The UI addon scaffold writes the studio block and ships agents and skills
description: pikku new addon <name> --ui writes package.json studio { addon: <name>, ui, messages } and files ['dist', 'messages', 'agents', 'skills'], because Studio links an addon by studio.addon and reads its agents and skills from the published package
tags: cli, addons, screens, studio, scaffold
---

# The UI addon scaffold writes the studio block and ships agents and skills

`addonUiFiles` in `packages/cli/src/functions/commands/new-addon-ui.ts` writes
the package's `package.json` with:

```json
{
  "files": ["dist", "messages", "agents", "skills"],
  "studio": {
    "addon": "<name>",
    "ui": "./src",
    "messages": "./messages/{locale}.json"
  }
}
```

- Studio's builder (`linkedAddons()` in pikkustudio-os
  `packages/builder/src/agents.ts`) only links a package whose `package.json`
  has a string `studio.addon`. Its agents (`agents/<name>.md`) and skills
  (`skills/<name>/SKILL.md`) are read from that package, and an agent it ships
  runs under the scope `agent:<addon>:<name>`.
- `addon` is the addon's short name: the `<name>` the command was given, which
  `scaffoldAddonUi` already holds to `/^[a-z][a-z0-9-]*$/`, the same pattern the
  builder requires (`addonAgentPath`). The package itself is
  `@pikku/addon-<name>`, so `addon` is the package name without its scope and
  `addon-` prefix, as `@pikkustudio/addon-spindle` has `"addon": "spindle"`.
- `agents` and `skills` are in `files` because npm leaves out anything a `files`
  list does not name, and the inspector's PKU366 fails the build when a valid
  screen agent or a `skills/<name>/SKILL.md` would not be published.

**What this rules out:** a scaffolded UI addon that Studio does not link, or
that publishes without the agents and skills its screens use.
