---
'@pikku/skills': patch
---

Skill descriptions are now one or two plain lines, because a harness puts every description in every system prompt: 34 skills went from 20,594 to about 6,460 characters. The `pikku-agent`, `pikku-workflow`, `pikku-emails`, `pikku-list-query`, `pikku-permissions`, `pikku-build` and `pikku-i18n` bodies are shorter with their rules kept; approval-gate enforcement detail for `pikku-workflow` moved to `references/workflow-reference.md`. `pikku-agent` gains a rule: never call a model or model SDK directly, all AI goes through `pikkuAgent` and its runner so the console can show it, and an owner who asks to skip that hears what they lose and confirms first.

Skills now read as design guidelines: what to reach for, the rules, one `pikku doc a b c` line for how to call it, and a short "Not in `pikku doc` yet" list for what the doc does not print. `pikku-workflow`, `pikku-addon`, `pikku-middleware`, `pikku-scenario` and `pikku-list-query` lost the code samples and option lists `pikku doc` already prints, with every rule, failure mode and security point kept. `pikku-permissions`, `pikku-wiring`, `pikku-concepts`, `pikku-auth`, `pikku-agent` and `pikku-services` gain exact `pikku doc` lines.
