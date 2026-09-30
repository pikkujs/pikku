---
type: decision
title: Every app command lives under `pikku app`
description: Creating, listing and packaging a frontend are all `pikku app …` subcommands — never `pikku new`, never a flag on `pikku deploy`
tags: [cli, frontends, native]
---

# Every app command lives under `pikku app`

An *app* is one entry in [`frontends`](frontends-is-the-one-list-of-apps.md):
a frontend project with an audience. Everything that creates, inspects or
packages one is a subcommand of `pikku app`:

```
pikku app new <name>
pikku app list
pikku app native init|add|check|upgrade <name>
```

Before this, the same concept was spread over three places: `pikku new app`
created a frontend, `pikku deploy apply --desktop` / `--desktop-url` generated a
desktop shell as a side effect of deploying a server, and `deploy.desktop` in
the config configured it. Someone looking for "how do I ship this as an app"
had to already know the answer was under `deploy`.

**What this rules out:**

- `pikku new app`. `pikku new` keeps code scaffolds only — `function`,
  `wiring`, `middleware` — things that live inside the functions package.
- App flags on `pikku deploy`. `deploy` ships servers. The one place it still
  touches a native app is installing the compiled server into a shell that asked
  for one (see [a native app belongs to a frontend](a-native-app-belongs-to-a-frontend.md)),
  and that is driven by the app's config, not by a flag.
- A top-level `pikku native` or `pikku tauri`. "Native" is something you do *to*
  an app, and "tauri" means nothing to someone who has not met it.

The verb comes before the name — `pikku app native init customer` — matching
`pikku fabric addon get <name>`. A bare `pikku app native customer` would have
to guess which verb was meant.

Signing and store upload, when they arrive, are `pikku app native release`,
not `pikku deploy`.
