---
type: decision
title: `expose` conflates a typed client with generic RPC callability
description: Why the public index trips PKU574 and cannot currently avoid it
resource: func:listPublished
tags: [public-api, pikku]
---

# `expose` conflates a typed client with generic RPC callability

`listPublished` is the public index. It is meant to be reachable by anyone —
that is the product — and it carries `expose: true`, which makes `pikku`
report:

```
[PKU574] 1 exposed sessionless function carries no permission and no addon
gate, so it is reachable by anyone through POST /rpc/:rpcName: listPublished
```

The warning is accurate. What it suggests as fixes are not available here.

## Two decisions, one flag

`expose: true` currently controls both:

1. whether the function appears in the **generated client surface** — the RPC
   map, the HTTP map, and therefore `usePikkuQuery`
2. whether it is callable by name through the **generic `POST /rpc/:rpcName`
   endpoint**

We want the first and not the second. Dropping `expose` was tried: PKU574 goes
quiet and the server-side HTTP route still works, but the generated HTTP map is
then empty of `/posts` and the app has no typed way to call its own public
endpoint. The page would have to hand-write a fetch and hand-write the response
type, which is the thing this framework exists to avoid.

So the flag is kept and the warning is accepted.

## Why that is safe here, specifically

Being reachable is the requirement. The protection is in the function rather
than in front of it:

- **sessionless** — there is no user, so nothing to leak by acting as one
- **`readonly: true`** — it cannot write, on a path that anyone can call
  arbitrarily often
- **the filter is in the query** — `status = 'published'` AND
  `published_at <= now`, neither of which a caller can drop. `status` alone
  would leak a scheduled announcement the moment somebody set its date;
  `published_at` alone would leak an archived post that still has one
- **the output is narrow** — no body, no ids, no author email. A public
  function returns what the public page needs, not what happens to be on the row

`recordView` is the same shape and additionally ignores an unknown slug
silently, so it cannot become a way to ask whether a draft exists under a
guessed name.

## What would resolve it upstream

Either a way to say "in the client surface, not on the generic RPC endpoint",
or an acknowledgement on the function that this exposure is deliberate — the
shape `PKU483` already uses, where `form: 'plain'` is how you state that reading
a row is *meant* to yield a usable credential.

Without one of those, every genuinely public endpoint in every Pikku app will
carry a permanent PKU574 warning, and a warning that cannot be actioned is a
warning people learn to scroll past — including the ones that matter.
