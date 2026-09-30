---
type: decision
title: "`frontends` in pikku.config.json is the one list of apps"
description: The top-level `frontend` key is gone; every frontend — served by pikku, deployed by Fabric, or packaged as a native app — is a named `frontends` entry in pikku.config.json
tags: [config, frontends, fabric]
---

# `frontends` in pikku.config.json is the one list of apps

```json
"frontends": {
  "customer": {
    "cwd": "apps/customer",
    "dist": "dist/client",
    "kind": "spa",
    "serve": { "urlPrefix": "/" },
    "native": { "identifier": "com.acme.customer", "platforms": ["desktop", "android"] }
  }
}
```

There used to be two lists that did not know about each other. `frontend:
{ dir, urlPrefix, spaFallback }` in `pikku.config.json` was the single built
directory `pikku serve` and `pikku deploy` mounted. A separate
Fabric-only file held the set of apps Fabric builds and deploys, and
`pikku new app` wrote there when that file existed. A project with two apps
could only tell the server about one of them, and a native app had no entry to
hang off at all.

Now there is one list, in the OSS config:

- **`cwd`** is the frontend's project directory — where its `package.json` is.
  Relative paths resolve against the config file.
- **`dist`** is its build output, relative to `cwd`. Pikku reads it and never
  builds it (see deploy-standalone's *deploy consumes a built frontend*).
- **`serve`** (optional) mounts `dist` on the pikku server's own origin, which
  is what the old `frontend` key did. Its presence is the whole switch;
  `urlPrefix` defaults to `/` and `spaFallback` to true. Only one entry may set
  it for now, because a standalone build embeds a single frontend.
- **`native`** (optional) makes it an installable app — see
  [a native app belongs to a frontend](a-native-app-belongs-to-a-frontend.md).
- `primary`, `deploy`, `kind`, `dev`, `serves`, `personas` keep the meaning
  Fabric and `pikku app new` already gave them.

**What this rules out:** a `frontends` list in any Fabric-only file.
Fabric's validate, smoke and build container read the app list from
`pikku.config.json` like everything else. A second home would let two files
claim the same app with different `cwd`s, which is exactly the drift one list
exists to prevent.

It also rules out a native or served frontend that is not in the list. There is
no flag that names a directory ad hoc; if pikku is going to serve it or package
it, it has a name.
