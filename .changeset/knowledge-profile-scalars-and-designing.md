---
'@pikku/knowledge': patch
---

feat(knowledge): a profile can read its own frontmatter keys, and `designing` joins the slice vocabulary

`readKnowledgeNotes` now takes the frontmatter keys a profile built on top of
this one adds — `readKnowledgeNotes(root, ['design', 'route'])` — and returns
them on the note, typed as `ProfileNote<'design' | 'route'>`. They
are still not read here: nothing in this package knows what they mean, and the
reader names them at the call. Without this the only way for a profile to keep
its own keys was to fork the parser, which is exactly what Fabric had done —
two copies of the same OKF reader, drifting.

`designing` is now a slice status. It sits before `proposed`: the slice is
written down but is NOT to be built yet, because whoever is being shown its
looks has not picked one. Only `proposed` is dispatchable, so the two cannot be
one status without a slice being built out from under the person still
choosing. It was already in use — validating such a project reported every
milestone under design as `knowledge-slice-bad-status`.

`checkKnowledgeResources` takes its third argument as an options bag —
`{ notes, known }` instead of a bare `notes` array — and `known` lets a profile
add ids it resolves from a source codegen meta does not describe: a live dev
database's tables, personas from a config file written before anything is
generated. It is unioned with the meta, never a replacement, so a resource is
only dangling when neither side has heard of it.

`buildKnowledgeGraph` carries `statusAt` onto the graph note. It is read off
frontmatter and typed here already; the graph was the one reader dropping it,
so a console showing a slice's status could not say how long it had held it.
