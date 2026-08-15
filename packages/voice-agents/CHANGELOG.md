# @pikku/voice-agents

## 0.0.5

### Patch Changes

- 7406bfe: Rename the agent runtime from `AI*` to `Agent*` (#596)

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

## 0.0.4

### Patch Changes

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.

## 0.0.3

### Patch Changes

- 32277d5: Make a voice conversation with an agent something a chat surface can turn on, rather than
  something each consumer reassembles.

  The server half already worked — `voiceInput` transcribed, `voiceOutput` synthesized a
  sentence at a time, and the AG-UI mapper forwarded the audio. What was missing was the
  turn's own words. The client sends audio, so only the server ever knows what was said,
  and nothing carried that back: a spoken turn rendered as an empty user bubble followed by
  an answer to a question nobody could see, and thread history recorded the base64 audio
  blob instead of the transcript — megabytes of unreadable data in place of the only
  readable record of the turn.

  `voiceInput` now records what it heard, the stream emits it as a `transcript` event ahead
  of the run (the reply starts within a few hundred milliseconds, and a question that
  appears after its answer reads as the wrong question), and it reaches the browser as
  `pikku:transcript`. Both run paths persist the transcribed message rather than the one
  that arrived on the wire. `audio-delta` also carries the sentence it says, which is what
  a barge-in needs to report the part the user actually heard — a reply cut off after "I'll
  delete the staging database and" is answered very differently depending on whether the
  model knows the sentence never landed.

  `@pikku/voice-agents` gains the two things a voice UI needs and could not get: a live
  input level, attached to the source rather than to a detector so it keeps reading on the
  Silero path, and the microphone list — re-readable on demand, because device labels are
  empty until permission is granted and nothing fires when it is. `VoiceSession` also
  learned manual turn boundaries, so push-to-talk is a mode rather than a detector fought
  to a standstill: holding the key through a three-second pause is someone thinking, and
  any endpointer worth having would cut them off.

  `<PikkuAgentChat voice />` puts a microphone beside the send button, promotes it to
  primary when nothing is typed, and opens an indicator with a live level bar, a device
  picker and a hold-to-record toggle. It plays the agent's speech, and cancels the run on
  barge-in — talking over the agent should stop the bill, not just the sound.

  Opt-in, because the component cannot check the two things it depends on: the agent has to
  be wired with `voiceInput` for the audio to be understood and `voiceOutput` for anything
  to come back.

## 0.0.2

### Patch Changes

- 82d506e: Ship the MIT LICENSE file in the tarball
