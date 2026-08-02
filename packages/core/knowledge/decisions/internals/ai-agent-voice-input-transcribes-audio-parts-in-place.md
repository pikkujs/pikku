---
type: decision
title: Voice input transcribes audio parts sequentially and in place
description: Each audio part is replaced by its text where it sat, one at a time, bounding concurrent downloads and preserving content order
tags: ai-agent
---

# Voice input transcribes audio parts sequentially and in place

The `voiceInput` middleware in
`packages/core/src/wirings/ai-agent/voice-input.ts` walks the last user
message's content parts in order and swaps each audio part for a text part at the
same index, awaiting one transcription before starting the next.

Order matters because the surrounding text parts are the user's own framing of
the audio; hoisting transcripts to the end would reorder the prompt. Sequencing
matters because a message can carry many attachments: a `Promise.all` would fan
out an unbounded number of concurrent multi-megabyte downloads and provider
transcription calls from a single request.

**What this rules out:** parallelizing the loop with `Promise.all`, and
collecting transcripts into a separate block appended to the message.
