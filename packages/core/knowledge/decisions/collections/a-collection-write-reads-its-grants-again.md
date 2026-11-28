---
type: decision
title: A generated collection write reads its grants again
description: Each write and action has a permission that asks the scope service, beside its live scope
tags: [collections, scopes]
---

# A generated collection write reads its grants again

The scope of every collection write and action is declared `live`, and the generated
function also has a permission that resolves the caller's grants through
`scopeService`. Live scopes are applied only where the function's metadata says
the function requires one, so what a revoked grant can still do would rest on
which inspector engine wrote that metadata. The permission does not depend on
it: a session cache that still holds a revoked grant cannot write.

Reads are not asked again. A cached session can list and open records for as
long as the app's session cache lives.
