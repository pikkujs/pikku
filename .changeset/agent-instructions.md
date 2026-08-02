---
'@pikku/core': patch
'@pikku/inspector': patch
---

`instructions` on an AI agent reaches the system prompt

`pikkuAIAgent` accepted an `instructions` property that nothing read: the
inspector never extracted it, so it never reached the generated meta, and
`buildInstructions` composed the system prompt out of role, personality and
goal alone. It is now a declared field on `CoreAIAgent`, extracted like every
other agent property, and appended after the goal — the goal is what the work
is, and these are how to go about it.
