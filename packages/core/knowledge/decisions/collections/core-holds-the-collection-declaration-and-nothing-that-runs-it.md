---
type: decision
title: Core holds the collection declaration and nothing that runs it
description: '@pikku/core/collections is a data declaration and types; queries are generated into the project'
tags: [collections, core]
---

# Core holds the collection declaration and nothing that runs it

`@pikku/core/collections` exports `defineCollections`, which returns its argument, and
types. It sits in core for one reason: three packages that share no other
dependency name the same shapes. An app and an addon write `db/collections.ts`, the CLI
reads it, an addon types its handlers against it and a collection screen reads the
description.

What a collection does at run time is code the CLI writes into the project. That
rules out a generic query engine, a record editor or an upload route in core: the
generated functions are ordinary Pikku functions, so scopes, permissions,
validation and `pikku all --security` apply to them as to any other.
