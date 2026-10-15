---
---

Tests only: the per-request key derivation and remote RPC round-trip tests
assert that the session crypto path uses one HKDF derivation per side instead
of a wall-clock budget. No published package changes.
