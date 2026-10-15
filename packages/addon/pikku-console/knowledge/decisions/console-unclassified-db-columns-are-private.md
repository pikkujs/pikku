---
type: decision
title: A database column with no privacy annotation is classed private
description: classificationFor passes through only public, private, pii and secret, and returns private for anything else, including a column with no annotation
tags: console, database, privacy
---

# A database column with no privacy annotation is classed private

`classificationFor` (`packages/addon/pikku-console/src/services/db-schema.service.ts:45-54`)
returns its argument only when it is `public`, `private`, `pii` or `secret`. For any
other value it returns `'private'` (`db-schema.service.ts:53`).

The caller passes `ann?.security ?? ann?.visibility` (`db-schema.service.ts:148`).
A column with no annotation gives `undefined`, which falls through to `'private'`.
The database schema view therefore never labels an unannotated column public.

**What this rules out:** treating an unannotated column as public in the schema
view. A column has to be annotated `public` to read as public.
