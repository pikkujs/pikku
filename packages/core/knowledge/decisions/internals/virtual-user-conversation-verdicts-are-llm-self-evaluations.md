---
type: decision
title: A conversation verdict is the virtual user's self-evaluation, not an assertion
description: The engine returns what the virtual user judged plus the transcript; deterministic checks stay with the caller
tags: virtual-user-conversation
---

# A conversation verdict is the virtual user's self-evaluation, not an assertion

`runConversation` ends by asking the virtual user LLM whether the `evaluate`
criterion was met and returns that as `ConversationVerdict` — `passed`, `reasoning`
and the full `transcript`
(`packages/core/src/wirings/virtual-user-conversation/`). Nothing in the engine inspects the
system the agent acted on.

The verdict is deliberately soft because the thing it judges is soft: whether a
conversation accomplished a natural-language task. Deterministic checks — that a
row was written, that an email went out — belong to the caller, which already
holds the virtual user and can `virtualUser.invoke(...)` after the conversation returns. The
`reasoning` and `transcript` fields exist so a soft failure is debuggable rather
than merely red.

**What this rules out:** having `runConversation` assert or throw on a failed
verdict, and adding deterministic post-conditions to `ConverseOptions` instead of
running them at the call site.
