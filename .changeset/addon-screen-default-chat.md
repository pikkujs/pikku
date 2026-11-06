---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

A screen can also set `defaultChat: false` to hide Studio's general Chat tab beside its agent tab (with no `agent`, the screen has no chat). It defaults to `true`, must be a boolean literal (PKU345 otherwise), and is recorded only when declared.

The agent and its skills ship in the addon's package: `pikku new addon <name> --ui` now puts `agents` and `skills` in `package.json` `files`, and writes the `studio` block Studio links an addon by, `"studio": { "addon": "<name>", "ui": "./src", "messages": "./messages/{locale}.json" }`. `pikku all` fails with PKU366 when a `files` list leaves out `agents/` while a screen names a valid agent the addon ships (one that is already PKU365 gets that error alone), or leaves out `skills/` while the addon has a `skills/<name>/SKILL.md`. A package with no `files` field is not checked.
