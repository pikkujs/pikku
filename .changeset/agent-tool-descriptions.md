---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
---

Give an agent's tools back the descriptions their authors wrote

A tool's description is what the model is told the tool does, and the main
thing it chooses between tools on. It was not reaching the model. `description`
is classed as a verbose field, so it is stripped from the metadata bundled into
the generated bootstrap — the copy `pikkuState('function', 'meta')` is built
from. `buildToolDefs` read the description from there, found it always
undefined, and fell through to the tool's own name. Every agent has been
choosing between bare identifiers. The same fallback was offering an addon's
MCP tools under their names, for the same reason.

Tool definitions now resolve descriptions through `metaService`, which reads
the verbose metadata and falls back to the minimal copy, so the authored text
is recovered wherever the generated `.pikku` directory is readable. Where it is
not — no `metaService`, or a deployment shipping only the stripped copy — a
tool falls back to its name, which is what it did before. Addon metadata is
likewise loaded verbose-first. `title` is no longer part of the chain: a title
labels a tool in a UI, it does not tell a model when to reach for it.

An addon has to ship the verbose file for any of this to reach it. `tsc` only
emits the JSON it sees imported and nothing imports the verbose meta, so the
bundled addons now copy it into `dist` explicitly.

`ref()` is resolved at build time. It used to be pushed through codegen as an
opaque string, so `ref('todos:doesNotExist')` generated cleanly and failed only
when the agent ran. The inspector now resolves each reference against the
project's functions, or — using the namespace-to-package mapping `wireAddon`
already provides — against the addon's own metadata, and reports an unwired
namespace (`PKU152`) or a missing function (`PKU153`) at codegen. An addon that
has not been built yet contributed no metadata and is skipped rather than
reported missing.

New `pikku --strict-meta` additionally fails the build on any agent tool with
no description (`PKU154`), including tools reached through an addon. It is off
by default, so nothing that builds today stops building; turn it on to hold a
project to the metadata its agents actually run on.
