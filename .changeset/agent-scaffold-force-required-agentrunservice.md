---
"@pikku/cli": patch
---

Force `agentRunService` as a required singleton service whenever the AI agent scaffold (`config.scaffold.agent`) is enabled. The generated public-agent permission (`isThreadOwner` in `agent.gen.ts`) always destructures `agentRunService`, but that file is written to disk after `requiredServices` is computed from inspecting hand-written sources, so the inspector never saw that usage. `agentRunService` stayed in `RequiredSingletonServices` as optional, and since `CoreServices.agentRunService` is itself optional, any project generating the agent scaffold failed to type-check with `'agentRunService' is possibly 'undefined'.` in `agent.gen.ts`.
