---
type: decision
title: A transcript is recorded only when something was actually heard
description: Recording an empty string sends a transcript event saying the user said nothing, which renders as an empty bubble rather than a pending one
tags: core, ai-agent
---

# A transcript is recorded only when something was actually heard

A turn can carry audio that reads entirely as non-speech and still have content
— an image with a silent caption clip — so there is nothing above to throw.
`voiceInput` records the transcript only when speech was found.

Writing `''` instead would emit a transcript event asserting that the user said
nothing. A client that distinguishes "not transcribed yet" from "transcribed"
by whether the key is present would then render that turn as a permanently
empty bubble rather than a pending one — a worse outcome than showing nothing,
because it looks settled.

**What this rules out:** defaulting the transcript to an empty string for a
uniform event shape. Absence and emptiness mean different things to the client,
and only absence is recoverable.
