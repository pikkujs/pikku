---
type: decision
title: Local persona switching is a dev panel
description: A developer switches to a persona on a local dev server from a panel in pikkustudio, sending the impersonation header; nothing leaves the machine
tags: services, auth
---

# Local persona switching is a dev panel

On a local dev server a developer picks a persona from a panel in pikkustudio.
The panel sends the impersonation header on its requests, so the app treats them
as that persona. Choosing "me" removes the header.

Nothing here reaches a live system, so it does not need the controls that staged
or live impersonation do. The developer's own session on the dev server is the
caller; the dev-only actor sign-in is how that session is established.

**What this rules out:** building local persona switching as a sign-in flow or a
hook. It is a request header set by a UI.
