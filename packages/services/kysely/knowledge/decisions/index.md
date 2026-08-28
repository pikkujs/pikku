---
type: overview
title: Decisions
description: How encrypted columns are wrapped, and which key wraps them
---

# Decisions

<!-- pikku:knowledge-index -->

- [Classification-driven encryption happens in a Kysely plugin](classification-driven-encryption-happens-in-a-plugin.md) — The existing column classification manifest drives a transparent query plugin, rather than encrypting the whole database file or asking call sites to encrypt
- [KEKs are scoped by purpose as well as version](keks-are-scoped-by-purpose-as-well-as-version.md) — Rows carry a keyId, and the plugin resolves KEKs through a seam rather than holding one; v1 ships a single key, but scoping never becomes a migration
- [The plugin is given a resolver, never a key](the-plugin-is-given-a-resolver-never-a-key.md) — Assembly order for classified columns — a plain Kysely handle, then a plugin that asks a `KEKResolver` per operation rather than being handed a key it holds for the life of the process

<!-- /pikku:knowledge-index -->
