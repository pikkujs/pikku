---
'@pikku/core': minor
'@pikku/inspector': minor
'@pikku/cli': minor
'@pikku/skills': patch
---

An addon's Studio screen can name an `agent` in `definePlugin`: the agent that answers in Studio's chat panel, in a second tab beside the general chat, while that screen is open. It resolves to `agents/<name>.md` in the addon package, which holds the agent's instructions and names the skills it follows (plain `skills/<name>/SKILL.md` folders, found by convention). The file starts with frontmatter whose `title` and `description` are message keys in the addon's `messages/en.json`. `pikku all` reads `agent` as a string literal and records it, with `agentTitle` and `agentDescription`, on the screen in the generated addon metadata. It fails with PKU365 when the name is not `/^[a-z][a-z0-9-]*$/`, the file is missing or empty, or the frontmatter lacks a `title` or `description`; a key missing from `messages/en.json` is PKU358, as for screen titles.
