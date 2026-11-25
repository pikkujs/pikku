---
type: decision
title: Providers are in-process trusted code, and the lock and scoped env are drift detection
description: An opted-in addon provider runs in the host's process with the services it needs; the lock, the frozen needs view, the scoped env and the protected keys limit an honest addon's drift and are not a sandbox
tags: [core, cli, provider, security, addon]
---

# Providers are in-process trusted code, and the lock and scoped env are drift detection

An addon provider is code the host opted in to by name and then runs in its own
process, so a hostile addon can do anything the process can. What the framework
adds is least privilege against an honest addon that changes between versions:

- The factory sees a frozen view of exactly its declared needs, and only the
  declared provides are copied back (`undeclared-read`, `undeclared-return`,
  `missing-return`). Functions never see the view.
- An addon provider's `env` holds only the names its addon declares with
  `defineVariable` or `defineSecret`, plus what `variableOverrides` and
  `secretOverrides` rename (`env-denied` otherwise). The allowlist is read from
  addon meta and the `wireAddon` overrides, never from runtime state.
- `secrets`, `variables`, `credentialService`, `auth`, `jwt` and `logger` are
  provided only through a source-level `replaces` (PKU394).
- `pikku-addons.lock` records the surface each opted-in provider asked for
  (provides, imports, adds-to, replaces). A change is PKU395 until approved. The
  lock cannot widen anything at run time: a hand-edited lock still leaves the
  runtime view at the declared needs.

`wireRemoteAddon` takes no providers (PKU381): a remote addon runs elsewhere, so
its providers could not run in this process. A `local` package on a remote addon
contributes in process.

**What this rules out:** presenting any of this as a sandbox, a `*` shorthand in
`replaces`, and a config-file route for providers.
