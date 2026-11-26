---
type: decision
title: Core holds the CRUD declaration and nothing that runs it
description: '@pikku/core/crud is a data declaration and types; queries are generated into the project'
tags: [crud, core]
---

# Core holds the CRUD declaration and nothing that runs it

`@pikku/core/crud` exports `defineCrud`, which returns its argument, and
types. It sits in core for one reason: three packages that share no other
dependency name the same shapes. An app and an addon write `db/crud.ts`, the CLI
reads it, an addon types its handlers against it and a CRUD screen reads the
description.

What a collection does at run time is code the CLI writes into the project. That
rules out a generic query engine, a record editor or an upload route in core: the
generated functions are ordinary Pikku functions, so scopes, permissions,
validation and `pikku all --security` apply to them as to any other.
