---
'@pikku/cli': patch
---

Keep the description of a function an agent lists as a tool in the runtime meta

`description` is classed as a verbose field and stripped from the meta a
deployment ships, but `agent-prepare` needs it to tell the model what each tool
does. Where the verbose file is unreadable — a deployed bundle, or any app
shipping only the stripped copy — every tool was offered under its bare name.

The functions an agent actually lists as tools now keep their description in the
minimal meta, so the model sees them everywhere the agent runs. Descriptions for
functions no agent calls stay stripped.
