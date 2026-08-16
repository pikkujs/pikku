---
'create-pikku': patch
---

Scaffold every template onto the `#pikku` alias

Templates are the one tree copied verbatim into a user's project, so whatever
they import is what every new Pikku app starts life importing. They reached
generated output through relative paths — `../../functions/.pikku/…` in a
runtime template, `../../.pikku/…` inside the functions template — which taught
the wrong habit and broke as soon as `create-pikku` relocated the directory,
as it does for StackBlitz.

All 63 of those specifiers now go through `#pikku/…`, and each template
declares the alias on both sides: `imports` for Node, tsx and `tsc`, and
tsconfig `paths` for the inspector, which builds its own program and never sees
the imports map. A runtime template points at the functions template next door;
the merge and rewrite `create-pikku` already performed retargets both onto
`./.pikku` — or `./pikku-gen` on StackBlitz — when the two become one project.
