---
'@pikku/assistant-ui': patch
'@pikku/voice-agents': patch
'@pikku/core': patch
---

Make a voice conversation with an agent something a chat surface can turn on, rather than
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
