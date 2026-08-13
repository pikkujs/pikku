---
'@pikku/console': patch
---

Export the knowledge surface from the package barrel.

`KnowledgePage` was exported, but the workspace it renders, its bundle types and
`resolveNoteLink` were not — so a host embedding the knowledge browser into its
own shell could not mount the workspace, type the bundle it feeds in, or resolve
a note link the same way the graph does. Resolving links differently is the
subtle one: `inbound` and `dangling` are computed against this resolver, so a
host with its own copy renders cross-links that have no backlink on the other
side.

Adds `KnowledgeWorkspace`, `KnowledgeWorkspaceProps`, `resolveNoteLink`, and the
`KnowledgeBundle`, `KnowledgeFinding`, `KnowledgeNote`, `KnowledgeSection` and
`KnowledgeSelection` types. No behaviour change.
