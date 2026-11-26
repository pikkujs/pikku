---
type: decision
title: An addon's CRUD collection is read and written by the addon's handlers
description: The host generates the guards and no query on the addon's tables
tags: [crud, addon]
---

# An addon's CRUD collection is read and written by the addon's handlers

An addon's rules about its tables are in its code: a blog post's publication
changes only by publishing, a slug is checked and its duplicate named, a status
is derived when read. A generated query would skip all of it. So an addon
publishes two things, its `db/crud.ts` as data and `crudHandlers` from
`<package>/crud`, and the app that opts in gets the same scopes, validation,
checks and audit as for its own tables, in front of the handlers.

The app's entry can only switch operations and actions off and add checks. A
field, a column or an operation it could add would be one no handler was written
for. Relations and images are left out of addon collections for the same reason:
both are served by queries and files the host generates itself.

The scopes close the CRUD backend's way in and no other. The addon's own scopes still
open its functions, and the app's code can still query its tables.
