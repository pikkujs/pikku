---
name: pikku-ai-voice
description: >-
  Use when adding voice input (speech-to-text) or voice output (text-to-speech) to AI agents in a
  Pikku app. Covers the voiceInput/voiceOutput AI middleware from @pikku/core/agent, per-script
  voices, and barge-in. TRIGGER when: code uses voiceInput, voiceOutput, or user asks about voice
  agents, speech-to-text, text-to-speech, transcription, or @pikku/ai-voice. DO NOT TRIGGER when:
  user asks about AI agent wiring generally (use pikku-agent) or the runner itself (use
  pikku-ai-vercel).
installGroups: [core]
---

# Pikku AI Voice (Speech I/O)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

## `@pikku/ai-voice` is deprecated and empty

The package still publishes, but its entire source is `export {}` — there are no
`STTService`/`TTSService` interfaces and nothing to import. Do not add it as a
dependency.

Voice now lives in **`@pikku/core/agent`** as two AI middlewares, and the
speech models are reached through the `agentRunner` (`transcribe` /
`generateSpeech`) rather than through separate services. See `pikku-ai-vercel`.

## API Reference

```typescript
import { voiceInput, voiceOutput } from '@pikku/core/agent'

voiceInput(config?: {
  model?: string               // transcription model — required in practice
  language?: string            // forwarded as openai providerOptions.language
  allowedAudioHosts?: string[] // allowlist for audio parts given as a URL
})

voiceOutput(config?: {
  model?: string               // speech model — required in practice
  voice?: string
  format?: string
  instructions?: string
  speed?: number
  language?: string
  speakableScripts?: string[] | Record<string, string>
  always?: boolean
})
```

Both attach through the agent's **`agentMiddleware`** array, not a
`middlewareHooks` option, and the agent is declared with `pikkuAgent` — there
is no `wireAgent`.

### `voiceInput` — audio in, text in its place

It rewrites the last user message, replacing each `audio/*` file part with a
text part holding the transcript. Downstream nothing can tell the turn was
spoken, which is why it records two shared-notes keys on the way past:

- `SPOKEN_TURN` (`'voice:spokenTurn'`) — `true`/`false` on every turn it sees.
  **Absent** when the middleware isn't wired at all, which is what lets
  `voiceOutput` still speak for a caller that has no voice input.
- `SPOKEN_TRANSCRIPT` (`'voice:transcript'`) — what the user was heard to say,
  only when something was heard. The stream wiring forwards it to the client as
  a `transcript` event; a voice client has no other way to know what its own
  audio said, and without it the user's turn renders as an empty bubble.

Behaviours that decide how a voice loop should be written:

- **It is a no-op without `agentRunner.transcribe`** — no error, the audio
  simply passes through untouched.
- **`config.model` is required once audio actually arrives**, and throws then
  rather than at wiring time.
- **A turn that was entirely non-speech throws `NoSpeechDetectedError`.** Catch
  it and go back to listening without running the agent — answering a
  hallucinated sentence is worse than answering nothing. It is deliberately
  distinct from a transcription failure, which is worth reporting.
- **Non-speech means an empty transcript, and nothing cleverer.** There was a
  per-segment confidence gate here and it was removed: Whisper is
  subtitle-trained, so it is _confident_ when it invents ("Thank you." scored
  better than the real sentence beside it). Pick an ASR that returns an empty
  string on silence rather than trying to filter one that doesn't.
- Audio arrives either inline (base64 `data`) or as a `url` fetched through
  `safeFetch`; either way 50MB is the ceiling.

### `voiceOutput` — sentence-at-a-time synthesis

It intercepts the output stream, buffers `text-delta`s to a sentence boundary,
and synthesizes each finished sentence immediately, so the first is playing while
the rest is still being written. Emissions are chained even though generation
overlaps, so the client hears them in order; on `done` it flushes the tail,
awaits the chain, and emits `audio-done` before the `done` event.

- **It speaks only in reply to speech** unless `always: true`. Only an explicit
  `SPOKEN_TURN === false` silences it — the key being absent (no `voiceInput`
  wired) still speaks. Set `always` for a read-aloud mode or a kiosk, where the
  whole output is meant to be heard; leave it off for an agent serving both typed
  and spoken callers, since synthesizing replies nobody is listening to costs
  real money per sentence.
- **A failed sentence is logged and skipped**, not thrown — one silent sentence
  beats the rest of the reply never arriving.
- **Barge-in aborts synthesis, not just playback**: the stream's `signal` is
  passed to the speech model, so sentences in flight stop being billed.

### `speakableScripts` — declare what the model can pronounce

Handed a script it has no voice for, a speech model typically neither fails nor
stays quiet: Kokoro reads out the _letter names_ — 24 seconds of "Arabic meem,
Arabic ra" for a one-line sentence. Declaring the range leaves anything outside
it unspoken and reports it once per reply as a `voice-unsupported` data event.

The record form maps script → voice, because a multilingual model usually needs
the matching voice too: asked for Chinese in a default American-English voice,
Kokoro spells the characters out in 9.9s where `zf_xiaobei` says it in 3.5.

Known scripts: `latin`, `devanagari`, `han`, `kana`, `arabic`, `cyrillic`,
`hangul`, `hebrew`, `greek`, `thai`. A sentence in several is settled by
precedence, not config order — `kana` first (it appears only in Japanese, so it
decides; `han` alone cannot), `latin` last (it turns up inside sentences in every
other script). Omitting the option means no check at all, which is right for a
genuinely multilingual provider.

`unspeakableScripts(text, speakable)` and `voiceForText(text, speakable,
fallback)` are exported if you need the same decision outside the middleware.

## Usage Pattern

```typescript
import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { voiceInput, voiceOutput } from '@pikku/core/agent'

export const voiceAssistant = pikkuAgent({
  name: 'voice-assistant',
  description: 'Holds a spoken conversation',
  goal: 'You are a voice assistant. You are being listened to, not read.',
  model: 'openai/gpt-5-mini',
  agentMiddleware: [
    voiceInput({ model: 'deepinfra/openai/whisper-large-v3-turbo' }),
    voiceOutput({
      model: 'deepinfra/hexgrad/Kokoro-82M',
      speakableScripts: {
        han: 'zf_xiaobei',
        kana: 'jf_alpha',
        devanagari: 'hf_alpha',
        latin: 'af_bella',
      },
    }),
  ],
})
```

Write the goal for the ear: no lists, no markdown, no IDs read digit by digit.
The one thing worth spelling out is approvals — spoken aloud, the confirmation
sentence is all the user gets, so let `approvalDescription` on the tool produce
it and forbid the model from asking for permission in its own words.
