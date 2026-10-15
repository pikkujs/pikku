---
type: decision
title: A native shell grants its IPC permissions only to the origin its mode names
description: nativeGrantUrl returns no grant for a bundled UI, the named origin for a remote url, and every loopback port for a sidecar, and the capability file is written from that value
tags: tauri, desktop, native, permissions
---

# A native shell grants its IPC permissions only to the origin its mode names

`nativeGrantUrl` in `packages/deploy/deploy-standalone/src/tauri/project.ts` decides which origin may call
native APIs (`project.ts:330`). Its doc comment says a bundled UI is trusted as the app's own page without
a remote grant, a remote origin gets nothing until one is named, and a sidecar gets every loopback port
(`project.ts:320-329`).

The switch returns `undefined` for a bundle (`project.ts:332-333`), the origin of the normalised URL for a
`url` mode (`project.ts:334-335`), and `http://127.0.0.1:*` for a sidecar (`project.ts:336-337`). The sidecar
case is wider than one port because the OS picks the port at launch and generation cannot know it. The
comment accepts that, because the alternative is an app whose native APIs never work
(`project.ts:325-328`).

`renderCapabilities` writes that value into the capability file. A `remote.urls` entry is added only when a
grant URL exists (`project.ts:352-353`), and the file's permissions are `core:default` plus the portable
native APIs (`project.ts:363`). Mobile-only APIs go in a separate capability file (`project.ts:354-355`).
The shell modes are described in [the desktop shell runs the server as a sidecar](the-desktop-shell-runs-the-server-as-a-sidecar.md)
and [a remote desktop shell bundles nothing](a-remote-desktop-shell-bundles-nothing.md).

**What this rules out:** native APIs for a remote origin that has not been named, and a single grant
covering every mode, such as a wildcard host for a remote URL.
