---
type: entity
title: Knowledge note
description: A markdown file whose path is its identity, and the thing this bundle is made of
tags: knowledge
---

# Knowledge note

A knowledge note is a markdown file under `knowledge/`. Its **path is its
identity** — there is no id field, no database row and no registry, so moving a
file renames the thing it describes and every link that pointed at it has to move
too.

Only `type` is required in the frontmatter. `index.md` and `log.md` are reserved:
an index lists the notes beside it and never itself.

This bundle exists twice over. It is the harness's own knowledge, and it is also
the fixture the knowledge suites read — which is why the notes here are short and
say something true rather than being lorem ipsum. A fixture that lies is a
fixture nobody trusts to change.

See [browse the knowledge base](../slices/02-browse-the-knowledge-base.md) for
where a reader meets one.
