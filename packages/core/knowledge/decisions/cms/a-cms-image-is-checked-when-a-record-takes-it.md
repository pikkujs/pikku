---
type: decision
title: A CMS image is checked when a record takes it
description: The stored file's size, start and end are read through ContentService; it is not decoded
tags: [cms, content]
---

# A CMS image is checked when a record takes it

A signed upload URL carries a key and nothing about the file, and
`ContentService` has no call that answers a stored object's size or type. So the
generated create and update read the object with `readFile`, which every
implementation has: they count its bytes, stop past the field's `maxBytes`, and
keep only its first bytes, its last bytes and, for an AVIF, its box headers.
Nothing new is asked of core or of a content service.

That recognises a type and catches a file that was cut off. It is not a decode,
and it says nothing about what lies between the ends. It also holds for the file
as it was at the save: the upload URL can still replace it until it expires, and
a refused file stays in storage.
