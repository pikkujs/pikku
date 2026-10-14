---
type: decision
title: A --organization value resolves to one id, and an ambiguous name is refused
description: resolveOrganizationId passes UUIDs through, matches a name or slug against the caller's organizations, and refuses both an unknown and an ambiguous value; with no flag it returns undefined and Fabric derives the org from the session
tags: cli, fabric, organizations
---

# A --organization value resolves to one id, and an ambiguous name is refused

`resolveOrganizationId` in `packages/cli/src/fabric/lib/organization.ts` turns the flag into an
organization id.

With no flag it returns `undefined` (`organization.ts:16`). The doc comment says Fabric then
derives the owning org from the session, which can import into whichever org the token is
scoped to (`organization.ts:6-10`). So the flag is what keeps a repo from landing in the wrong
org. A value that is a UUID is returned unchanged (`organization.ts:17`).

Anything else is matched case-insensitively against each organization's slug or name
(`organization.ts:19-24`). No match throws and lists the caller's slugs (`organization.ts:26-31`).
More than one match throws and asks for the id (`organization.ts:32-37`).

**What this rules out:** choosing the first of several matching organizations, and treating an
unknown name as no flag.
