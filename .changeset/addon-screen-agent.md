---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

An addon's Studio screen can name an `agent` in `definePlugin`: the agent that answers in Studio's chat panel, in a second tab beside the general chat, while that screen is open. It resolves to `agents/<name>.md` in the addon package, which holds the agent's instructions and names the skills it follows (plain `skills/<name>/SKILL.md` folders, found by convention). `agent: 'studio:<name>'` instead picks an agent Studio ships; `pikku all` only checks the format, looks up no file and records no title or description. The file starts with frontmatter whose `title` and `description` are message keys in the addon's `messages/en.json`. `pikku all` reads `agent` as a string literal and records it, with `agentTitle` and `agentDescription`, on the screen in the generated addon metadata. It fails with PKU365 when the value is neither a name `/^[a-z][a-z0-9-]*$/` nor `studio:<name>`, or a name, the file is missing or empty, or the frontmatter lacks a `title` or `description`; a key missing from `messages/en.json` is PKU358, as for screen titles, and a key missing from another locale is a warning, as for screen titles.

A screen can also set `defaultChat: false` to hide Studio's general Chat tab beside its agent tab (with no `agent`, the screen has no chat). It defaults to `true`, must be a boolean literal (PKU345 otherwise), and is recorded only when declared.

The agent and its skills ship in the addon's package: `pikku new addon <name> --ui` now puts `agents` and `skills` in `package.json` `files`, and writes the `studio` block Studio links an addon by, `"studio": { "addon": "<name>", "ui": "./src", "messages": "./messages/{locale}.json" }`. `pikku all` fails with PKU366 when a `files` list leaves out `agents/` while a screen names a valid agent the addon ships (one that is already PKU365 gets that error alone), or leaves out `skills/` while the addon has a `skills/<name>/SKILL.md`. A package with no `files` field is not checked.
