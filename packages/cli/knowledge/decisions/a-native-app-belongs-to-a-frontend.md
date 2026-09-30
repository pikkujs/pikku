---
type: decision
title: A native app belongs to a frontend
description: `frontends.<name>.native` makes a frontend installable; its Tauri project lives at `<cwd>/src-tauri`, is committed, and holds nothing specific to the machine that generated it
tags: [native, tauri, frontends, ci]
---

# A native app belongs to a frontend

A desktop, Android or iOS app is a **frontend packaged in a native shell**, so
it is configured on that frontend's entry and its project lives beside it:

```
apps/customer/            ← frontends.customer.cwd
  package.json            ← gains @tauri-apps/cli, @tauri-apps/api, plugin packages
  dist/                   ← frontends.customer.dist — the shell's frontendDist
  src-tauri/              ← the native project, committed
```

`<cwd>/src-tauri` is Tauri's own convention — `src-tauri` beside the frontend's
`package.json` — so `tauri build` run from `cwd` finds everything without
flags, and a project with several apps gets one native project each for free.

## Committed, and portable

The generated project is committed. The moment someone adds a native plugin,
edits the window or signs the Android build, it is their code, and
`gen/android` / `gen/apple` — the Gradle and Xcode projects `tauri android init`
and `tauri ios init` write — carry signing and manifest setup that cannot be
regenerated.

Nothing in it depends on the machine that ran `pikku app native init`. That is
what makes the intended CI shape possible:

```
build the frontend → upload dist/ as an artifact
matrix [mac-arm, mac-x64, windows, linux, android, ios]:
  download dist/ into cwd → tauri build
```

The sidecar mode below is the one exception, and it is why it is not the default.

## Three ways the window gets its UI

| Config | The window shows | Platforms |
| --- | --- | --- |
| *(default)* | `dist`, bundled into the app; the API is called remotely | desktop, Android, iOS |
| `"url": "https://…"` | a deployed server's own origin; nothing bundled | desktop, Android, iOS |
| `"bundleServer": true` | the compiled pikku server, spawned as a sidecar | desktop only |

The default reverses deploy-standalone's *a remote desktop shell bundles
nothing*, which ruled out bundling the frontend so that the webview would always
sit on the server's real origin. That rule was right for a desktop window onto
one server and wrong as the only option: it made every app a website wrapper
(which the App Store rejects), gave it no UI without a network, and meant there
was nothing to build per platform except a pointer.

The cost of bundling is paid in auth, and it is named here so nobody rediscovers
it: the page's origin becomes `tauri://localhost` (Apple) or
`http://tauri.localhost` (Android, Windows). The API is then cross-origin, so

- cookies are third-party, and the client authenticates with a bearer token
  (`setAuthorizationJWT`) kept in the store plugin or the OS keychain;
- the server's CORS rules must allow those two origins with the auth headers;
- an OAuth redirect cannot land on the app's origin, so social login goes out
  through the system browser and back through a deep link.

`url` mode keeps the old origin guarantees and pays none of this, which is why
it stays available.

`bundleServer` ships a binary compiled for one target triple, so its
`src-tauri/binaries/` is machine-specific and gitignored. `pikku deploy apply
--provider standalone --runtime bun` installs the compiled server into every
frontend whose `native.bundleServer` is set — driven by the config, not by a
flag on deploy (see [every app command lives under `pikku app`](every-app-command-lives-under-pikku-app.md)).

## A server-rendered frontend cannot be bundled

A `kind: "ssr"` frontend needs a server to render its pages, and a native app
has no server to run it on. `pikku app native init` refuses the default mode for
one and says to either build it as a static SPA (TanStack Start's SPA mode is
what `templates/tanstack` already serves) or use `url` mode.
