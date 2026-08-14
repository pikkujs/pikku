---
type: decision
title: A voice turn's transcript is sent before the run starts, on the raw channel
description: The client does not know what it said, and an answer starts streaming within a few hundred milliseconds — a question arriving after its answer reads as the wrong question
tags: core, agent
---

# A voice turn's transcript is sent ahead of the run

A voice client sends audio, so it does not know what it said. Until the
transcript reaches it, its own message renders as a blank bubble.

The event is sent _before_ the run rather than alongside it because the answer
begins streaming within a few hundred milliseconds. Sent concurrently, the
transcript routinely lands after the first tokens of its own answer — and a
question that appears beneath its answer reads as a question about something
else entirely.

It goes on the raw channel rather than through the stream middleware because it
is not part of the reply: it is what the user said, and the stream hooks are
built to transform what the agent says.

**What this rules out:** folding the transcript into the run's event stream for
uniformity. Ordering is the whole point, and the stream is where ordering is
least under this code's control.
