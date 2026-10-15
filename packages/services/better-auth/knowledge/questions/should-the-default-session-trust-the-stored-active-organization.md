---
type: question
title: Should the default session trust the stored active organization?
description: With no mapSession, orgId is copied from activeOrganizationId on the session row, and default-session.ts does not check that the user belongs to that organization
tags: [better-auth, sessions, organizations, authorization]
---

# Should the default session trust the stored active organization?

`defaultSession` in `packages/services/better-auth/src/default-session.ts` builds the
session for a registration that supplies no `mapSession`. Its `orgId` is the
`activeOrganizationId` read from the session row (`default-session.ts:14`,
`default-session.ts:16`), and that value is copied into the returned session when it
is set (`default-session.ts:17`).

The header comment says the field comes from "the organization plugin's
`activeOrganizationId`, which the plugin already keeps on the session row"
(`default-session.ts:6-7`), and that the default exists so apps stop hand-writing a
`mapSession` for that one hop (`default-session.ts:8-10`). The comment does not say
whether the value is checked against membership, and the file contains no membership
lookup.

Current behaviour: whatever organization the session row holds becomes the caller's
`orgId`, with no check in this file. Whether the organization plugin only ever writes an
organization the user belongs to is not visible from this file.

Open: should the default session verify membership before it copies the value, or is
the plugin's write meant to be the guarantee? The code states neither.
