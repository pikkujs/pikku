---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/addon-graph': patch
'@pikku/express': patch
'@pikku/fastify': patch
'@pikku/uws': patch
'@pikku/node-http-server': patch
---

Carry a secret's `allowedHosts` through code generation, and close three gaps in
the SSRF guard.

`allowedHosts` was declared and enforced but never survived codegen: the
inspector did not read the property off the `defineSecret` literal, and the meta
builder rebuilt its objects without it. Enforcement in `assertSecretAllowedForHost`
then always saw `undefined`, so the egress restriction was a no-op by default —
and, with `secrets.requireAllowedHosts` set, threw for every secret including the
ones that correctly declared hosts. Both stages now carry the field, and the
secrets verifier asserts it against the generated JSON rather than a hand-written
meta literal, which is why the existing tests stayed green.

`isPrivateHost` now checks an explicit CIDR table instead of ad-hoc octet
comparisons. It previously missed `100.64.0.0/10` — which contains Alibaba
Cloud's `100.100.100.200` metadata endpoint — along with `192.0.0.0/24`,
`198.18.0.0/15`, `192.88.99.0/24`, the TEST-NETs, multicast and reserved space.
IPv6 gains a real parser, so `fec0::/10`, `ff00::/8`, and NAT64 (`64:ff9b::/96`)
and 6to4 (`2002::/16`) forms wrapping an internal IPv4 address are caught.

`safeFetch` takes an optional `resolveHost`, checked on the initial URL and every
redirect hop, so a *public* hostname pointing at a private address is refused —
the `169-254-169-254.nip.io` shape a literal-only check cannot see. Core cannot
resolve DNS itself (Workers has no DNS API), so the Node resolver ships as
`@pikku/core/node-host-resolver` and the Node server runtimes install it during
`init()`. The connection is not pinned to the address that was checked, so a
rebind between check and connect is still possible.

The graph addon's `httpRequest` node called bare `fetch`, bypassing the guard
entirely; it now goes through `safeFetch`.
