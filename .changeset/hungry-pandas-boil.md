---
'@pikku/core': patch
'@pikku/ai-vercel': patch
---

fix: collect working memory from a delegate-mode parent agent

A delegating parent's `text-delta` events were dropped at the outermost output
channel, above the working-memory hook, so every `<working_memory>` block it
wrote from its first hand-off onward was discarded before anything could read
it. The parent's text is now routed through the working-memory hook and into a
sink instead of being dropped outright, so the blocks are collected while the
client, the thread history and user channel middleware still see nothing.

The resume path built no delegate filter at all and streamed a delegating
parent's text to the client after an approval; it now suppresses text the same
way the initial path does.

The AI SDK rejects a system message inside `messages` outright, so the working
memory prompt the framework injects as one failed every run that enabled
working memory at all. The runner now lifts system messages onto the `system`
option, after the agent's own instructions.
