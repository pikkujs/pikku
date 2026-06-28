---
'@pikku/cli': patch
---

Fix two `pikku dev`/`pikku db seed` failures under the Bun runtime.

- **IPv4 bind:** `pikku dev` passed `hostname: 'localhost'`, which `Bun.serve`
  resolves to IPv6 `[::1]` only — unreachable from an IPv4 `127.0.0.1` reverse
  proxy. Both the Bun and Node dev servers now bind explicit `127.0.0.1`
  (works on both runtimes; Node previously relied on `--dns-result-order=ipv4first`).
  The user-facing content URL still shows `localhost`.
- **Seed tolerance:** the Bun sqlite runtime's `exec` threw
  `no valid SQL statement` on comment-only/empty input (e.g. a placeholder
  `seed.sql`), whereas `node:sqlite` silently no-ops. It now skips when nothing
  executable remains after stripping comments; real SQL still runs verbatim.
