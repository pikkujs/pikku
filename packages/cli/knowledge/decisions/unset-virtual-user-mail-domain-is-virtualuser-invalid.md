---
type: decision
title: An unset virtual user mail domain is virtualuser.invalid
description: When a project names no mail domain, virtual user addresses land on virtualuser.invalid, a domain no one can own, so a send fails instead of reaching a stranger
tags: cli, virtual-users, email
---

# An unset virtual user mail domain is virtualuser.invalid

`DEFAULT_VIRTUAL_USER_EMAIL_DOMAIN` is `virtualuser.invalid`
(`packages/cli/src/utils/resolve-virtual-users.ts`). `resolveVirtualUsers` uses it as the
default domain and passes it to `virtualUserEmails` to generate each virtual user's address.

The comment gives the reason. A domain nobody can own means an app that never
sends mail runs unchanged, and an app that does send fails at the first send
rather than delivering a magic link to someone else.

Every consumer is meant to read addresses through this one function. The comment
names the codegen output, the seed and both run commands as consumers.

**What this rules out:** a plausible default domain, and a per-consumer
calculation of virtual user addresses.
