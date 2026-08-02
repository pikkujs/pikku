---
type: decision
title: Self-authentication is declared, not detected
description: A function that authorizes callers in its own body says so with selfAuthenticated; codegen never tries to infer it
tags: permissions, codegen
---

# Self-authentication is declared, not detected

Some functions are genuinely closed while carrying no session, scope or
permission: a webhook receiver that verifies a signature, a handler that
redeems a signed invite, an exchange endpoint that validates a token before it
does anything. Nothing in meta distinguishes those from a function nobody
remembered to gate, so `validateExposedFunctionsGated` (PKU574) would warn about
them on every build.

The fix is a declaration — `selfAuthenticated: true` on the function config —
not analysis of the body. Detection would have to recognise an open-ended set of
authorization idioms, and it fails in the expensive direction: a body that
*looks* like it checks something silences the warning for a function that
checks nothing. A declaration cannot be wrong by accident. Someone typed it,
it is greppable, and it survives into meta where an audit reads it as what it
is — a claim by a named author, not an inference.

It carries no runtime effect and grants nothing. Its entire job is to move a
gate that codegen cannot see into a place where a human can, and to keep PKU574
worth reading: a warning that is usually wrong stops being read, which costs
more than the warning ever saved.

**What this rules out:** inferring self-authentication from the function body or
from what it imports; giving `selfAuthenticated` any runtime meaning (it must
never be a way to skip a check the runtime would otherwise run); and dropping
the PKU574 warning instead, which was the alternative that would have left every
genuinely ungated function silent too.
