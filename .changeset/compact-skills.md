---
'@pikku/skills': patch
---

Skill descriptions are now one or two plain lines, because a harness puts every description in every system prompt: 34 skills went from 20,594 to about 6,460 characters. The `pikku-agent`, `pikku-workflow`, `pikku-emails`, `pikku-list-query`, `pikku-permissions`, `pikku-build` and `pikku-i18n` bodies are shorter with their rules kept; approval-gate enforcement detail for `pikku-workflow` moved to `references/workflow-reference.md`. `pikku-agent` gains a rule: never call a model or model SDK directly, all AI goes through `pikkuAgent` and its runner so the console can show it, and an owner who asks to skip that hears what they lose and confirms first.
