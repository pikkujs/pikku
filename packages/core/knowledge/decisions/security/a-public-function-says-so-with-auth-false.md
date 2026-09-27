---
type: decision
title: A public function says so with auth: false
description: An exposed sessionless function that writes auth: false is public on purpose and PKU574 stays quiet; one that leaves auth out still warns
tags: authorization, inspector, rpc
---

# A public function says so with auth: false

PKU574 warns about an exposed sessionless function with no gate. Some of those
are exactly what the author meant: a published programme, a price list, a health
check. Before this, the only way to quiet the warning on one was a gate that
gated nothing — an always-true permission, or `permissionsInBody: true`, which
claims a check the body does not make. Both put a false statement into meta to
silence a true one, and the alternative, living with the warning, teaches
everyone to stop reading it.

`auth: false` is already the field that says "no session required". Writing it
on a `pikkuSessionlessFunc` is redundant at runtime — sessionless already means
that — which is what makes it useful as a declaration: nobody writes it by
accident, so its presence is the author deciding the function is public. The
inspector now records `auth` as written (`true`, `false` or absent) instead of
folding `false` into absent, and the check treats `false` as a gate the author
declared, the same way it treats `permissionsInBody`.

The case the warning exists for is unchanged. A sessionless function that picked
up `expose: true` later, with nobody thinking about who may call it, has no
`auth` at all — and still warns.

**What this rules out:** a separate `public: true` flag, which would be a second
field meaning what `auth: false` already means; reading `readonly` or the
function's name as evidence it is safe to expose; and silencing PKU574 for every
sessionless function, which would drop the accidental-exposure case with the
intentional one.
