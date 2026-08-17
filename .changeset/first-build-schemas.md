---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Generate the schemas a first build used to leave out.

A contract type reaches the schema generator only through a file that imports
it, and for a type exported by nothing but its own function file that file is
the RPC internal map — which `pikku all` writes *after* schemas. On a first
build there is no map to read yet, so those schemas came out missing from a run
that otherwise succeeded, and the RPC failed with `MissingSchemaError` on its
first call in a deployment. A second `pikku all` fixed it, which is why this
only ever bit fresh checkouts and CI.

`pikku all` now re-inspects and re-generates schemas when the build that just
wrote the RPC internal map for the first time left contract references
unresolved — the condition PKU463 already reports. Confined to that build: a
project whose references are unresolved for some other reason would otherwise
pay a second inspection on every run for a re-generation that cannot help it.

`@pikku/inspector` exports `unresolvedSchemaReferences(state)`, the check behind
PKU463, so the decision can be made without re-deriving it.
