---
'@pikku/core': patch
---

Security hardening (follow-up to the #966 C1/C3 fixes):

- SSRF (C1): `isPrivateHost` now also rejects alias/encoded forms that resolve to internal targets — trailing-dot FQDNs (`localhost.`), the reserved `*.localhost` name, IPv4-mapped IPv6 (`::ffff:127.0.0.1`), octal/decimal/hex-encoded IPv4 (`0177.0.0.1`, `2130706433`, `0x7f000001`), and the full `fe80::/10` link-local range. `safeFetch` also strips `Authorization` and `Cookie` headers whenever a redirect crosses origin so credentials cannot leak to a redirected host.
- Forgeable approval markers (C3): the sub-agent approval marker is now identified by a non-forgeable `Symbol` brand set only by framework code, instead of the plain `__approvalRequired` string key. A delegating tool's LLM-shaped `result.object` (plain JSON) can no longer conjure an approval/suspension even though the tool is allowed to forward approvals.
