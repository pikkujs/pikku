---
type: decision
title: Provider meta is read from source, sorted, and written identically by both engines
description: The inspectors record providers, collections, optional keys, replaces and per-profile variants with sorted keys so the Go and Rust engines agree byte for byte, and an addon publishes them as metaVersion 2
tags: [inspector, provider, parity]
---

# Provider meta is read from source, sorted, and written identically by both engines

A `defineProvider` or `defineWireProvider` is recorded with its kind, each
variant's needs, optional needs, provides and optional provides, `replaces` and
`addTo`; a `defineProviderCollection` is recorded by name. Union returns list
every member's keys, a key that is not in every member is optional, and a
conditional spread makes its keys optional. Every list is sorted, so the two
engines (the Go inspector and its Rust port) produce the same meta whichever
order members and keys were declared in. `inspector-parity/fixtures/providers`
holds a positive file and a refusal file per field and the parity scoreboard
compares both engines on it.

An addon publishes `.pikku/providers/pikku-providers-meta.gen.json` as
`{ metaVersion: 2, providers, collections }`; a host that finds another
`metaVersion` refuses the addon with PKU374 text naming the version. A
collection name written in a `.d.ts` is read from the type, so it must stay a
string literal there.

PKU369 to PKU383 are the source-shape refusals (PKU370 is not a provider code);
PKU385 to PKU399 are raised by the CLI resolver.

**What this rules out:** order-dependent meta, and a provider read at run time
instead of from source.
