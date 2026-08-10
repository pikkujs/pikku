---
type: decision
title: Agent speech travels as a CUSTOM AG-UI event rather than being dropped
description: AG-UI has no speech event, and dropping it makes a voice agent reached over HTTP silently inaudible while the provider still bills for the audio
tags: core, ai-agent
---

# Agent speech travels as a CUSTOM AG-UI event

The AG-UI protocol has no event type for synthesized speech, so the bridge
forwards it as `CUSTOM`, the same way it forwards the other pikku-specific
events.

The alternative was tried: the mapper dropped the event, on the reasoning that a
protocol without a speech event has no way to carry one. The result is a voice
agent reached over HTTP that is completely silent — `voiceOutput` synthesizes
every sentence, the provider bills for every one of them, and none of it gets
past the mapper. Nothing errors, so there is nothing to find.

**What this rules out:** filtering unknown event types at the AG-UI boundary as
a tidiness measure. `CUSTOM` exists precisely so a protocol gap degrades to
"the client ignores it" rather than "the server threw the work away".
