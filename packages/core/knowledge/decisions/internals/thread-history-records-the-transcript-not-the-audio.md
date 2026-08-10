---
type: decision
title: Thread history records what the model was asked, which for a spoken turn is the transcript
description: The wire carried a base64 audio blob; persisting it writes megabytes of unreadable data and loses the only readable record of the turn
tags: core, ai-agent
---

# Thread history records the transcript, not the audio that arrived

What goes into thread history is what the model was actually asked. For a typed
turn that is what arrived over the wire. For a spoken turn it is not: the wire
carried a base64 audio blob, and `voiceInput` replaced it with a transcript
before the model ever saw it.

Persisting the blob would write megabytes of unreadable data into the history
*and* discard the only readable record of what was said — the worst of both.

Both the streaming and non-streaming paths do this, and both check identity
rather than assuming: a middleware is free to rewrite the message list into
something with no relation to this turn, and in that case there is no transcript
to substitute and the list is persisted as-is.

**What this rules out:** persisting the inbound message verbatim on the grounds
that it is the ground truth. For voice it is the least useful representation
available, and the substitution is exactly what makes the history readable.
