---
'@pikku/addon-console': patch
'@pikku/cli': patch
'@pikku/console': patch
'@pikku/core': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-standalone': patch
'@pikku/inspector': patch
'@pikku/n8n-import': patch
'@pikku/cloudflare': patch
'@pikku/ai-deepinfra': patch
'@pikku/ai-vercel': patch
'@pikku/ai-voice': patch
'@pikku/kysely': patch
'@pikku/kysely-mysql': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-sqlite': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/skills': patch
'@pikku/voice-agents': patch
---

Rename the agent runtime from `AI*` to `Agent*` (#596)

`AI` described the model provider, not the thing being named. Every symbol that
belongs to the agent runtime now says `Agent`; the symbols that genuinely wrap a
model provider — `AIEmbeddingService`, `AIProviderOptions`, `AIEmbedParams`,
`AITranscriptionParams`, `AIGenerateImageParams` and their siblings, and the
`@pikku/ai-vercel` / `@pikku/ai-deepinfra` / `@pikku/ai-voice` packages — keep
their names.

**Wiring**

- `pikkuAIAgent` → `pikkuAgent`, `pikkuAIScorer` → `pikkuAgentScorer`,
  `pikkuAIJudge` → `pikkuAgentJudge`
- `CoreAIAgent` → `CoreAgent`, `AIAgentInput` → `AgentInput`, `AIAgentStep` →
  `AgentStep`, `AIMessage` → `AgentMessage`, and the rest of the agent types
- `AIAgentRunnerService` → `AgentRunnerService`, `AIStorageService` →
  `AgentStorageService`, `AIRunStateService` → `AgentRunStateService`

**Entry points**

`@pikku/core/agent` → `@pikku/core/agent`, `@pikku/core/agent-scorer` →
`@pikku/core/agent-scorer`.

**Queues**

The scorer queues are now `agent-score-fast` and `agent-score-slow`. Drain the
old `ai-score-fast` / `ai-score-slow` queues before deploying — jobs still
sitting on them when the new workers start will never be picked up.

**Scaffolds**

The agent scaffold pikku wrote for your project — `<scaffold>/agent/agent.gen.ts`
and its schemas file — imports `@pikku/core/ai-agent`, which no longer exists. A
scaffold is normally written once and then left alone, so `pikku all` would find
it present and leave the broken import in place. It now deletes an agent scaffold
importing either removed entry point and regenerates it in the same run. Anything
you added to that file goes with it, so move local edits out first.

**Database**

The agent tables are renamed: `ai_threads`, `ai_message`, `ai_tool_call`,
`ai_working_memory`, `ai_run` and `ai_run_score` become `agent_threads`,
`agent_message`, `agent_tool_call`, `agent_working_memory`, `agent_run` and
`agent_run_score`, along with their indexes and the `ai_working_memory_pk`
constraint. The same rename applies to the MongoDB collections.

`ensurePikkuSchema` creates tables it cannot find, so an existing database will
get empty `agent_*` tables and leave the old data stranded in `ai_*`. Rename
them before the first boot on the new version:

```sql
ALTER TABLE ai_threads        RENAME TO agent_threads;
ALTER TABLE ai_message        RENAME TO agent_message;
ALTER TABLE ai_tool_call      RENAME TO agent_tool_call;
ALTER TABLE ai_working_memory RENAME TO agent_working_memory;
ALTER TABLE ai_run            RENAME TO agent_run;
ALTER TABLE ai_run_score      RENAME TO agent_run_score;
```
