---
type: decision
title: The virtual user catalogue excludes any RPC scoped under virtualUser
description: deriveCatalogue drops every function whose scope begins with virtualUser, so a persona holding those scopes cannot start runs, read findings or set schedules through the catalogue
tags: core, virtual-users, catalogue, scopes
---

# The virtual user catalogue excludes any RPC scoped under virtualUser

`packages/core/src/wirings/virtual-user/virtual-user-derive.ts` builds the catalogue of
RPCs a virtual user could reach. It skips a function whose scope list contains any
scope whose first segment is `virtualUser` (`virtual-user-derive.ts:39-46`, the
test at line 44).

The comment gives the reasons. A persona whose role carries `virtualUser:*` could
otherwise start more runs, read every run's findings (an adversarial run's
transcript is "working exploits against this same app"), and put a persona on a
schedule "that outlives it" (`virtual-user-derive.ts:39-43`).

The same function also skips scenario steps (`virtual-user-derive.ts:35`) and
functions that are not exposed (`virtual-user-derive.ts:37`). Those rules are
recorded in other notes.

**What this rules out:** a persona reaching the run-control or schedule RPCs
through its own catalogue, and an adversarial run reading its own findings.
