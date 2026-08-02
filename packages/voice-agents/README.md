# @pikku/voice-agents

Headless browser primitives for holding a spoken conversation with a Pikku AI agent.

This package owns the microphone, the speech playback queue, and the ordering between them. It renders nothing, knows nothing about how a turn reaches your backend, and holds no chat state — so it composes with an existing chat surface (`@pikku/assistant-ui`, or your own) rather than replacing it.

## Install

```bash
yarn add @pikku/voice-agents
```

## The loop

```tsx
import { useVoiceConversation } from '@pikku/voice-agents'

const Conversation = ({ runId }: { runId: string | null }) => {
  const voice = useVoiceConversation({
    onBargeIn: async () => {
      // The user started talking over the agent. Stop generating now —
      // playback is already paused.
      if (runId) await rpc.invoke('interruptAgent', { runId })
    },
    onTurn: async ({ audio }, { interrupted }) => {
      const text = await rpc.invoke('transcribeAudio', { audio })
      await rpc.invoke('sendMessage', {
        text,
        // What the agent actually got through before it was cut off. Send it
        // so the model can see where it stopped rather than assuming its last
        // sentence landed.
        heardSoFar: interrupted?.text,
      })
    },
  })

  return (
    <button onClick={voice.listening ? voice.stop : voice.start}>
      {voice.listening ? 'Stop' : 'Talk'}
    </button>
  )
}
```

Feed synthesized audio back in as it arrives:

```ts
voice.speak({ text: sentence, audio: await response.arrayBuffer() })
```

## What each piece is for

| Export | Purpose |
| --- | --- |
| `useVoiceConversation` | The whole loop: listen, detect the end of a turn, play the reply, handle barge-in. |
| `VoiceSession` | The microphone, framework-free. Acquired once, held across turns. |
| `AudioPlaybackQueue` | Sequential speech playback that can be stopped mid-word and asked what was heard. |
| `detectSilence` | Energy-based end-of-turn detection on a live `AudioNode`. |

## Two design decisions worth knowing

**The microphone is acquired once and released only on teardown.** Reacquiring per turn is the obvious implementation and it is the one that makes Bluetooth headsets unusable: each `getUserMedia` renegotiates the device from A2DP to the mono HFP profile, which cuts any music playing, drops output quality audibly, and takes long enough to swallow the first word. Holding it open means the user hears that transition once, at the start of the conversation.

**Barge-in pauses first and commits later.** Playback pauses on the first audible frame so the agent stops talking immediately, but the interruption is only committed once the turn ends and proves long enough to be speech. A cough resumes playback instead of ending the reply.

## Server side

Interrupting the agent itself lives in `@pikku/core`. Wire it like any other agent control RPC:

```ts
import { agentInterrupt } from '@pikku/core/ai-agent'

wireHTTP({ method: 'post', route: '/agent/interrupt', ...agentInterrupt() })
```

It checks the run belongs to the caller before stopping it, and needs no channel — it ends a stream rather than continuing one, so it is reachable over a plain RPC while the stream itself is held open elsewhere. It resolves `false` when there was nothing left to stop, because racing a run that finishes on its own is the normal case here, not an error.

Cancelling the model call, persisting the truncated reply marked `interrupted`, and emitting an `interrupted` stream event (`pikku:interrupted` over AG-UI) all happen on the original stream. The next turn then shows the model its own cut-off message followed by whatever the user said, and lets it decide whether to resume, correct itself, or move on.

Non-streaming agents (`rpc.agent.run`, and the resume half of `rpc.agent.approve`) are interruptible through the same call. There is no stream to emit an event on and nothing was delivered to truncate, so the caller gets an `AgentInterruptedError` — distinguishable from a provider failure, and the run is recorded as `interrupted` rather than `failed`.

### Tools that outlive the reply

Interrupting stops the model, not a tool already executing — its side effect has happened. Rather than lose that, the result is written to the thread as a tool message marked `undelivered`, and the model raises it unprompted on the next turn ("that deploy did go through"). The summary costs nothing extra: it falls out of the next turn's ordinary context load.

Only mutations are kept. A `readonly` tool that gets interrupted is discarded — nothing changed, and by the next turn its answer may be stale, so re-reading beats explaining it.

The write is not awaited before the stream closes, because barge-in has to stop the agent talking immediately. The next run on that thread waits for it instead, so the note is always in context before the turn that should mention it.

`interrupt` resolves `{ stopped, inFlightTools }`. `inFlightTools` names what is still executing so the agent can say something true about it — not offer to undo it, which it cannot.

### Where the speech arrives

`voiceOutput` synthesizes on the server, a sentence at a time as the model writes, so the first one is playing while the rest is still being generated. AG-UI has no event for speech, so it reaches the browser as `CUSTOM` alongside the other pikku-specific ones:

```ts
case 'CUSTOM':
  if (event.name === 'pikku:audio-delta') {
    // { data: base64, format: 'mp3' | 'pcm16' | … }
    voice.speak({ text: '', audio: fromBase64(event.value.data) })
  }
```

`pikku:audio-done` follows the last delta and precedes `RUN_FINISHED`. It means every sentence has been synthesized and sent — not that playback has finished, which only the queue knows. Use it to stop showing a "thinking" state; use `AudioPlaybackQueue`'s idle callback to know the agent has stopped talking.

Synthesizing in the browser instead — `voice.speak({ text, audio: await synthesize(text) })` — is the other supported shape, and the one to reach for when the reply is short enough that a single round trip beats streaming, or when the voice is chosen per user at the edge. Do one or the other: with `voiceOutput` wired, the sentences are already paid for and on the wire.

## Asking permission out loud

A tool declared `approvalRequired` suspends the run, and its `approvalDescription` supplies the wording — `Delete the todo called "Buy milk"`. Speak that string, not a summary of it:

```ts
import { spokenApproval, interpretConsent } from '@pikku/voice-agents'

for (const approval of run.pendingApprovals) {
  const prompt = spokenApproval(approval)
  await voice.speak({ text: prompt.text, audio: await synthesize(prompt.text) })

  const answer = await nextTranscript()
  const consent = interpretConsent(answer)
  if (consent === 'unclear') continue // ask again; never assume
  await rpc.invoke('approveAgent', {
    runId,
    toolCallId: prompt.toolCallId,
    approved: consent === 'granted',
  })
}
```

On a screen a badly worded confirmation is still checkable against the tool name and arguments next to the button. Spoken aloud the sentence *is* the whole interface, so it has to be the one the function sanctioned — "delete the production database" and "tidy things up" get the same "yeah, go on". `spokenApproval` therefore copies the reason in untouched and only appends a fixed question; it never builds a description out of the arguments, and when a function supplied none it says so instead of guessing.

Tell the agent to stay out of it. A model that announces the delete before calling the tool has just asked for consent in wording nobody checked, and the user cannot hear the difference:

> Never ask for permission to add or delete a todo. Those tools stop and ask on their own, in wording that has been checked. Just call the tool.

`interpretConsent` returns `'granted' | 'denied' | 'unclear'`, and returns `'unclear'` for anything that is not plainly one or the other — an answer holding both ("yes — no, wait"), a change of subject, silence. Asking again costs a sentence; guessing costs whatever the tool was about to do, and afterwards nobody can tell the two apart.
