# @pikku/assistant-ui

## 0.12.12

### Patch Changes

- 786dae5: Bump every dependency whose latest release is a major across the monorepo, and
  port the code the majors broke: `cookie` 2's `parseCookie`/`stringifySetCookie`
  API in `@pikku/core` and the three runtime HTTP adapters, and assistant-ui 0.15's
  store client in `@pikku/assistant-ui`.

## 0.12.11

### Patch Changes

- a7fcd2e: Declare dependencies that were imported but missing from `package.json`

  `@pikku/openapi-parser` and `@pikku/better-auth` imported `zod`, `@pikku/next`
  imported `path-to-regexp`, `@pikku/cli` imported `kysely`, and
  `@pikku/assistant-ui` imported `rxjs`, none of which were declared. Each
  resolved through Yarn hoisting inside the monorepo and would fail for anyone
  installing the package on its own.

  `rxjs`, `kysely` and `path-to-regexp` reach consumers through public
  signatures — `Observable<BaseEvent>` is the return type of a published method,
  and `createCoercionPlugin` returns a `KyselyPlugin` — so they are runtime
  dependencies rather than build-only ones.

  `@pikku/assistant-ui` pins `rxjs` to the exact `7.8.1` that `@ag-ui/client`
  pins, rather than a caret range. The two packages exchange `Observable`s, so a
  range that floats to a second copy gives them two incompatible `Observable`
  types.

  `@pikku/kysely` also drops `SqliteSerializePlugin`, an alias of
  `SerializePlugin` that has been marked `@deprecated` in favour of it. Use
  `SerializePlugin`.

- Updated dependencies [7406bfe]
  - @pikku/voice-agents@0.0.5

## 0.12.10

### Patch Changes

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.
- Updated dependencies [fd9d834]
  - @pikku/voice-agents@0.0.4

## 0.12.9

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

- Updated dependencies [32277d5]
  - @pikku/voice-agents@0.0.3

## 0.12.8

### Patch Changes

- 416606c: Replace the hand-rolled SSE parser with the AG-UI client runtime (`@ag-ui/client` + `@assistant-ui/react-ag-ui`); agent chat is now streaming-only, with the approval/resume flow preserved.

## 0.12.7

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.6

### Patch Changes

- f4f7046: feat(assistant-ui): export useFileAttachment hook, modelSupportsVision, PendingFile, UploadAttachmentFn, and INLINE_SIZE_LIMIT

## 0.12.5

### Patch Changes

- 9060165: The console now shows function version history, live queue depths with a Failed column, and scheduler last-run status with run history. Workflow canvas and run selector have been polished. The console build is ~6.5× faster thanks to a switch to rolldown-vite (Vite 7 + Oxc React transform).

## 0.12.4

### Patch Changes

- 424c777: `PikkuAgentChat` now accepts a `toolComponents` prop — a map of
  `toolName` → React component — for per-tool custom rendering inside
  the assistant bubble. Unmatched tool calls continue to fall through to
  the default expandable tool-call display.

  This unlocks generative-UI patterns: register a `renderWidget` tool on
  the agent, return structured props from it, and mount real UI (charts,
  diffs, cards) inline in the chat from the persisted tool-call args.
  Because the rendered widget is just a tool call under the hood, it
  survives refresh, streams correctly, and stays part of the thread's
  history.

  ```tsx
  <PikkuAgentChat
    agentName="myAgent"
    threadId={threadId}
    resourceId={userId}
    api="/rpc/agent"
    toolComponents={{
      renderWidget: ({ args }) => <WidgetRegistry spec={args} />,
    }}
  />
  ```

## 0.12.3

### Patch Changes

- f85c234: Add unified credential system with per-user OAuth and AI agent pre-flight checks
  - Unified CredentialService with lazy loading per user via pikkuUserId
  - wire.getCredential() for typed single credential lookup
  - MissingCredentialError with structured payload for client-side connect flows
  - Console UI: Global/Users credential tabs, per-user OAuth connect/revoke
  - AI agent pre-flight check: detects missing OAuth credentials from addon metadata, shows "Connect your accounts" prompt before chat
  - CLI codegen: generates credentialsMeta per addon package for runtime lookup
  - Vercel AI runner: catches MissingCredentialError as runtime fallback

## 0.12.2

### Patch Changes

- cc4a8e0: Show friendly error messages in agent chat instead of silently failing with a loading spinner

## 0.12.1

### Patch Changes

- 387b2ee: Rework agent chat UI with approval flows, tool call error badges, hideToolCalls option, and non-streaming runtime support
