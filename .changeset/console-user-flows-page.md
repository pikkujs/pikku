---
'@pikku/console': patch
---

Add a dedicated **User Flows** page to the console (#850)

User flows and their personas now live under Tests → User Flows
(`/tests/userflows`) instead of the Workflows page. The page has a
`Flows | Personas` view: flow cards show their cast (overlapping persona
avatars) and last-run status, personas render as cards with a read-only
detail drawer, and opening a flow shows a persona-driven timeline of its
steps (actor, status, and per-step RPC args). The Workflows page is now
workflows-only. Built with Mantine primitives and theme-aware colours.
