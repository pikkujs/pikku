---
type: decision
title: Agent tool permission filtering reads the live function config, not the metadata
description: The pikkuAuth brand survives only on live permission objects, so a metadata-driven check would silently admit every gated tool
tags: agent
---

# Agent tool permission filtering reads the live function config, not the metadata

`buildToolDefs` in `packages/core/src/wirings/agent/agent-prepare.ts`
decides which tools and sub-agents to expose to the model by calling
`checkAuthPermissions` against the permission objects held in the live function
(or agent) config in `pikkuState`, using the metadata only to learn that a
permission exists at all.

The `pikkuAuth` brand that marks a permission as an authorization gate exists
only on those live objects. The metadata's by-name permission registry is never
populated, so resolving names through it collects no predicates — and a filter
that collects no predicates admits everything. The failure is silent: every gated
tool would be handed to the model for any session.

**What this rules out:** simplifying the filter to read
`fnMeta.permissions` / `subMeta.permissions` directly, and caching a
name-to-predicate map derived from metadata.
