---
type: decision
title: A wall-clock threshold is a load test in disguise
description: The KEK derivation test asserted a fixed 50ms budget for work that took 10ms, which went red about one run in five once the suite was large enough to compete for the machine
tags: core, testing, crypto
---

# A wall-clock threshold is a load test in disguise

`crypto-utils.test.ts` guards a real property: unwrapping N secrets must not
cost N KEK derivations. Deriving a KEK is a deliberately slow KDF, so doing it
per secret turns a 10ms operation into a 4-second one.

It guarded it with `assert.ok(elapsed < 50)`. Measured on this machine:

| | |
| --- | --- |
| one `deriveKEK` | ~86ms |
| 50 `envelopeDecrypt` | 10.8ms |
| the old 50ms threshold | 4.6x headroom |
| the failure it guards against | ~4281ms — a **396x** separation |

So the assertion had 4.6x of margin to detect a 396x regression. Everything
between those two numbers was noise, and once core's suite reached ~2000 tests
competing for the same cores, a 10ms window drifting past 50ms became routine:
roughly one run in five went red, always on a machine where nothing was wrong.

**Calibrate against a measurement taken in the same run.** The test already
derives a KEK, so timing that call is free, and the assertion becomes
`elapsed < oneDerivation` — unwrapping all fifty must cost less than deriving
once. Under load both sides slow down together, so the ratio holds.

**What this rules out:** raising the constant. 100ms or 200ms buys a smaller
flake rate and the same class of bug, and it drifts again the next time the
suite grows or CI moves to a noisier runner. Any assertion of the form
"operation X takes less than N milliseconds" has this problem; express it as a
ratio against something measured alongside it.

Worth knowing: `envelopeDecrypt(kek: CryptoKey, …)` takes the derived key as a
parameter, so it *cannot* derive one — the property is already enforced by the
signature, and [[the-api-report-pins-members-not-just-names]] would catch a
change to it. The test is defence in depth, which is a reason to make it cheap
and quiet rather than to delete it.

Related: [[an-unref-d-timer-cannot-be-awaited-under-node-test]], the other
source of nondeterminism found in the same pass.
