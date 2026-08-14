---
type: decision
title: Audio chunks are labelled with the format the provider actually returned
description: The configured format is only a request, so the response's own format wins with the request and pcm16 as fallbacks
tags: agent
---

# Audio chunks are labelled with the format the provider actually returned

`synthesizeAudio` in `packages/core/src/wirings/agent/voice-output.ts` labels
each `audio-delta` event with `result.audio.format` first, falling back to the
requested `config.format` and finally to `pcm16`.

Speech providers treat the output format as a preference: an unsupported or
omitted value silently yields whatever the provider defaults to. Stamping the
requested format on the chunk would tell the client to decode bytes it did not
receive, producing noise rather than an error.

**What this rules out:** labelling chunks from `config.format` because "we asked
for it", and dropping the fallback chain to a single source.
