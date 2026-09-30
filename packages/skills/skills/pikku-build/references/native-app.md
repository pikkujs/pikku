# Shipping an app as a desktop or Android app

Read this when an app in `frontends` has to be installed rather than visited: a
desktop app, an Android APK, later an iPhone app. The app is still the same
frontend. A native app is that frontend packaged in a Tauri shell, configured on
its `frontends` entry, with the Tauri project committed beside it.

```
apps/customer/            ← frontends.customer.cwd
  package.json            ← gains @tauri-apps/cli, @tauri-apps/api, one package per plugin
  dist/                   ← frontends.customer.dist, which the shell packages
  src-tauri/              ← the native project, committed
```

## The commands

Every app command is under `pikku app` — native included, as `pikku app native`.
There is no `pikku new app`, and no app flag on `pikku deploy`.

```bash
pikku app new <name>                  # a second frontend, from the starter template
pikku app list                        # every app, where it lives, what it ships as
pikku app native init <name>          # write the native project (or re-apply config to it)
pikku app native add <name> store biometric   # add plugins
pikku app native upgrade <name>       # rewrite pikku's half from the config as it stands
pikku app native check [name]         # compare projects to the config, and apps to each other
```

`init` flags, all optional. Each one is saved into `frontends.<name>.native`
first, and every later `add`, `upgrade` and `check` reads the config, not the
flags:

| Flag | Meaning |
| --- | --- |
| `--desktop` `--android` `--ios` | Platforms. None given: desktop, Android and iOS, or desktop alone with `--bundle-server` |
| `--identifier com.acme.customer` | Bundle id and Android package name. Default `com.<npm scope>.<app name>` |
| `--product-name "Acme"` | The name people see. Default: the app name |
| `--url https://app.example.com` | Open a deployed origin instead of bundling `dist` |
| `--bundle-server` | Ship the compiled pikku server inside the app (desktop only) |
| `--plugins store,dialog` | Native plugins, comma-separated |

The resulting config:

```json
"frontends": {
  "customer": {
    "cwd": "apps/customer",
    "kind": "spa",
    "native": {
      "identifier": "com.acme.customer",
      "platforms": ["desktop", "android"],
      "plugins": ["store", "biometric"]
    }
  }
}
```

## Pick the mode first

| Config | The window shows | Platforms | Costs |
| --- | --- | --- | --- |
| *(default)* | `dist`, bundled into the app | desktop, Android, iOS | the API is cross-origin |
| `"url": "https://…"` | a deployed server's own origin | desktop, Android, iOS | no UI without a network; the App Store rejects a site wrapper |
| `"bundleServer": true` | the compiled server, spawned as a sidecar | desktop only | a bun-compiled binary per target |

**The default mode's cost is auth.** A bundled page's origin is
`tauri://localhost` (macOS, iOS, Linux) or `http://tauri.localhost` (Windows,
Android), so the API is on another origin:

- cookies are third-party, so authenticate with a bearer token and keep it in the
  `store` plugin, not in a cookie;
- the server's CORS rules must allow both origins, with the auth headers;
- the API base can no longer be `window.location.origin` or a relative `/api`.
  Read it from a build-time variable (`VITE_API_URL`) that the native build sets;
- OAuth cannot redirect back to the app's origin. Social login goes out through
  the system browser and returns through a deep link.

`url` mode pays none of this, because the page lives on the server's real origin.
`bundleServer` pays none of it either, and is the offline, single-machine option.
Neither `url` nor `bundleServer` can be combined with the other.

**A `kind: "ssr"` frontend cannot be bundled.** There is no server in the app to
render it, so `init` refuses and asks you to build it as a static SPA or use
`--url`.

## What pikku owns and what you own

The project is yours to edit. Pikku rewrites only these parts, on every `add`
and `upgrade`, and never touches anything else:

| Pikku rewrites | You own |
| --- | --- |
| `src/pikku.rs` (every plugin initialiser) | `src/lib.rs`, `src/main.rs`, which call `pikku::plugins(builder)` once |
| `capabilities/pikku.json`, `capabilities/pikku-mobile.json` | any other `capabilities/*.json` |
| the `# pikku:plugins:*` and `# pikku:mobile-plugins:*` blocks in `Cargo.toml` | the rest of `Cargo.toml` |
| `identifier`, `productName`, `build.frontendDist`, `bundle.externalBin` in `tauri.conf.json` | every other key, the window list included |
| `@tauri-apps/*` entries in `package.json`, only when missing | the rest, including pinned versions |
| `ui/index.html`, with `bundleServer` only | icons, `Info.ios.plist`, `gen/android`, `gen/apple` |

Put your own crates outside the marker blocks. If a marker is deleted, `add`
refuses rather than guess. If `lib.rs` stops calling `pikku::plugins`, `check`
reports it, because otherwise no plugin you configure is initialised.

## Plugins

`store`, `dialog`, `clipboard-manager`, `os`, `notification` and `geolocation`
run everywhere. `biometric`, `haptics`, `barcode-scanner` and `nfc` are
mobile-only. Pikku gates them with `#[cfg(mobile)]` and a target-specific
dependency, so the desktop build of the same crate still compiles. Call a plugin
through its `@tauri-apps/plugin-*` package, behind a
`window.__TAURI_INTERNALS__` check so the same build still runs in a browser.
iOS consent strings are written to `Info.ios.plist`; reword them for the app.

## The identifier

One per app, used on every platform, and **unique across apps**. Two apps that
share an identifier replace each other on install and share a data directory.
`init` refuses a clash and `check` reports one. Android sets the format: no
hyphens, no segment that starts with a digit, no Java keyword. macOS also rejects
an identifier ending in `.app`. The identifier can change freely until the first
store release and never afterwards.

## Building

Generation is plain file writing, so it succeeds on a machine that cannot build
the result. From the app's `cwd`, after installing:

```bash
bun run tauri dev                      # against the frontend's dev server
bun run tauri build                    # after building dist
bun run tauri android init && bun run tauri android build --apk
```

Desktop needs a Rust toolchain. Android also needs the Android SDK and NDK, and
iOS needs Xcode on a Mac. `tauri android init` and `tauri ios init` write
`src-tauri/gen/android` and `gen/apple`; commit them, because signing and the
manifest live there.

**CI builds from an uploaded `dist`.** Nothing in `src-tauri/` depends on the
machine that generated it, so build the frontend once, upload `dist/` as an
artifact, and run `tauri build` on a runner per platform. The exception is
`bundleServer`, whose `binaries/` holds a server compiled for one target and is
gitignored. `pikku deploy apply --provider standalone --runtime bun` compiles the
server and installs it into every app whose `native.bundleServer` is set.

Builds are unsigned. macOS asks for right-click → Open on first launch, Windows
shows SmartScreen, and an Android debug APK sideloads. A signed release needs
keys that the CI holds as secrets.
