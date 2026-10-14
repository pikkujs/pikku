---
type: decision
title: An unset persona mail domain is personas.invalid
description: When a project names no mail domain, persona addresses land on personas.invalid, a domain no one can own, so a send fails instead of reaching a stranger
tags: cli, personas, email
---

# An unset persona mail domain is personas.invalid

`DEFAULT_PERSONA_EMAIL_DOMAIN` is `personas.invalid` (`packages/cli/src/utils/resolve-personas.ts:19`).
`resolvePersonas` uses it as the default domain and passes it to `personaEmails`
to generate each persona's address (`resolve-personas.ts:31-38`).

The comment gives the reason. A domain nobody can own means an app that never
sends mail runs unchanged, and an app that does send fails at the first send
rather than delivering a magic link to someone else (`resolve-personas.ts:12-18`).

Every consumer is meant to read addresses through this one function. The comment
names the codegen output, the seed and both run commands as consumers
(`resolve-personas.ts:25-29`).

**What this rules out:** a plausible default domain, and a per-consumer
calculation of persona addresses.
