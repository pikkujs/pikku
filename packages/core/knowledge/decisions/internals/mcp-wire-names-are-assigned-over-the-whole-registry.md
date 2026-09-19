---
type: decision
title: MCP wire names are assigned over the whole registry, not derived per name
description: Sanitising each name on its own is lossy — `a:b` and `a.b` both become `a_b` — so one of the two targets would be unreachable
tags: [mcp, naming]
---

# MCP wire names are assigned over the whole registry

MCP clients constrain tool and prompt names to `[A-Za-z0-9_-]`. Pikku's
namespace separator is `:`, so every target contributed by an addon — `bb2:getMe`
and friends — carries a name the client cannot accept. Clients drop such names
from the session rather than fail the connection, which reads as the tools simply
not existing. The names are therefore rewritten at the transport boundary and
resolved back on the way in; the namespace itself is untouched, since it is what
dispatch keys on.

The rewrite is computed for **all** names of a target type at once, not for one
name in isolation. Replacing illegal characters one name at a time is not
injective: `a:b` and `a.b` both sanitise to `a_b`, so the list handlers would
advertise one name twice and the resolver could only ever pick one of them. The
other target becomes unreachable, silently.

The assignment runs in two passes over the sorted names:

1. Every name that is already wire-legal claims itself. A target whose name a
   client can already spell keeps that spelling, whatever else is registered.
2. The rest are sanitised, and a collision takes the next free `_2`, `_3`, …
   suffix.

Sorting makes the result depend only on the set of registered names, so the same
registry always produces the same wire names, across processes and restarts.

**What this rules out:** a pure `wireName(name)` function. Correctness here is a
property of the whole registry, and a signature that cannot see the registry
cannot have it. It also rules out percent-style escaping, which would be
injective but would turn every namespaced tool into something unreadable in the
client's UI, for a collision that needs two targets differing only in their
separator.
