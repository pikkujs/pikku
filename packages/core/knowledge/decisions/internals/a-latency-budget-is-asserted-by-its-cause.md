---
type: decision
title: A latency budget is asserted by its cause, not by the clock
description: The per-request key derivation and mesh RPC round-trip tests count WebCrypto calls and check the algorithm instead of timing them, because a millisecond budget fails under CI load while the regression it guards is a choice of KDF
tags: core, testing, crypto
---

# A latency budget is asserted by its cause, not by the clock

Two tests guarded the per-request crypto path with wall-clock budgets:
`encryptWithKeyMaterial` + `decryptWithKeyMaterial` under 5ms a pair, and a
mesh RPC round trip (`buildMeshHeaders` → `pikkuMeshAuthMiddleware`)
under 20ms. Both went red on loaded CI runners (8.6ms, 151ms) with nothing
wrong, blocking unrelated PRs (#2112), after #1175 had already loosened them.

What the budgets protected is a single decision: the per-request path expands
key material with HKDF, never with the PBKDF2 passphrase KDF `encryptJSON`
uses (600k iterations, ~170ms). The mesh session used to go through
`encryptJSON`, which made every hop pay two password derivations.

**So the tests spy on `crypto.subtle` with `t.mock.method` and assert the
calls**: exactly one `importKey` and one `deriveKey` per encrypt and per
decrypt, both named `HKDF`, and no `deriveBits`. Switching the KDF to PBKDF2,
adding a second derivation, or routing the mesh session back through
`encryptJSON`/`decryptJSON` each fails them — checked by hand when they were
written. None of that depends on how busy the machine is.

**What this rules out:** a looser constant kept as a fallback, or a ratio
against a measurement when the regression is a structural choice. A ratio
([[a-wall-clock-threshold-is-a-load-test-in-disguise]]) is the right tool when
the property really is "fewer of an expensive thing" and nothing countable is
exposed; when the cause is observable, assert the cause.
