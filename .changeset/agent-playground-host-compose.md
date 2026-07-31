---
'@pikku/console': patch
---

Expose which agent the playground is pointed at.

`AgentPlaygroundPage` resolved the agent from the URL against the project meta
inline, so a host composing the playground panels itself — putting the
conversations rail in a panel of its own rather than in `AgentThreePane`'s
column — had to repeat that resolution to know what to pass
`AgentPlaygroundSurface`.

`useAgentPlaygroundState()` is that answer, and the page now uses it too.
