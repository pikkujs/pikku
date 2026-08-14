---
type: decision
title: Only an explicit `false` silences a spoken reply
description: The key being absent means no voice input is wired and nothing reported either way, so those callers keep the behaviour they had before the option existed
tags: core, agent
---

# Only an explicit `false` silences a spoken reply

`voiceOutput` speaks a reply unless the turn is explicitly marked as not having
arrived by voice. The distinction is between three states, not two:

- `true` — `voiceInput` handled this turn and it carried speech.
- `false` — `voiceInput` handled this turn and a real user really typed it.
- absent — no voice input is wired at all, so nothing reported either way.

Treating absent as `false` would silence every caller who wired `voiceOutput`
without `voiceInput`, changing behaviour that worked before the option existed.
Treating absent as `true` would speak replies to typists on any stack where the
flag never gets set.

**What this rules out:** normalising the flag to a boolean at any point between
`voiceInput` and `voiceOutput` — that collapses absent into one of the other two
and picks a wrong answer for somebody.
