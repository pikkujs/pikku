---
'@pikku/cli': patch
'@pikku/mantine': patch
---

Replace `workspace:` protocol ranges in published dependency fields with literal
version ranges. Our publish path (`changeset publish`) does **not** rewrite the
workspace protocol, so these leaked verbatim into npm:

- `@pikku/cli` declared `@pikku/better-auth: "workspace:*"` in `dependencies`,
  which shipped to `0.12.36` and made it uninstallable for any consumer that
  doesn't already pin better-auth (`@pikku/better-auth@workspace:*: Workspace
  not found`).
- `@pikku/mantine` declared `@pikku/react: "workspace:^"` in `peerDependencies`
  (leaked as a peer warning rather than a hard failure).

Both now use literal caret ranges, matching every other `@pikku/*` dependency.
A `scripts/check-no-workspace-protocol.mjs` guard now runs as a `validate-deps`
CI job (and gates `yarn release`) to fail the build if a `workspace:` range ever
appears in a published dependency field again (`devDependencies` are exempt —
they are stripped on publish).
