---
type: decision
title: A provider collection is keyed by label and read as frozen entries
description: defineProviderCollection names a services key, each contributor adds one item under its provider name, readers get a frozen label-sorted list, and an empty list is a valid reader value
tags: [core, provider, collection, analytics]
---

# A provider collection is keyed by label and read as frozen entries

`defineProviderCollection(name)` declares a list, and `defineProvider({ addTo })`
contributes one item to it. The collection's name is a services key: a reader
destructures it and gets `{ label, item }[]` sorted by label (the provider's
name), frozen, and a provider cannot also provide that name (PKU398). A
contributor is built before its readers and after its own needs; a reader that
contributes to its own collection is a cycle (PKU387).

A collection nobody contributes to is an empty list, and a contributor with no
variant for a target is absent there rather than PKU388. A contributor no selected
reader reaches is not selected, so an SDK nobody reads is not bundled. Items may
have a `stop()`, called in reverse resolved order with the rest.

Core registries become collections this way. `analyticsSinks` is core's collection
of `{ sink, map }`, read by `fanOutAnalytics`, and the registry type and its
factory are gone. `otlpSinks` and `eventHubRegistry` stay registries.

**What this rules out:** a wire collection (collections are built once per
process; PKU383), and a collection whose entries are keyed by anything other than
the provider's name.
