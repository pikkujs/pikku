---
type: decision
title: A message with nothing to say carries no text part at all
description: An attachment on its own is a real turn, and providers are entitled to reject an empty text part sitting beside it
tags: core, ai-agent
---

# A message with nothing to say carries no text part

When a turn has no text, the text part is omitted rather than included as an
empty string.

An attachment on its own is a legitimate turn — a spoken one carries audio and
no text whatsoever — so "no text" is a normal state, not a degenerate one.
Providers are entitled to reject a message part with empty content, and that
rejection would land on a caller who never wrote any text to begin with.

**What this rules out:** normalising the text to `''` for a uniform message
shape. Uniformity here buys nothing and costs a provider error on the one turn
type that most needs to work.
