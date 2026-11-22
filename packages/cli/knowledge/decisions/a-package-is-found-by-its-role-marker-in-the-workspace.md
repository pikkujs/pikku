---
type: decision
title: A package is found by its role marker in the workspace, not by a key in the root config
description: The root pikku.config.json holds every setting; a workspace package's config is only a marker (main true, or addon with a namespace), and the CLI discovers packages from the root package.json workspaces
tags: cli, config, packages, workspace, addons, discovery
---

# A package is found by its role marker in the workspace, not by a key in the root config

The root `pikku.config.json` holds every setting (`db`, `scaffold`, `scenarios`, `environments`, `backends`, `frontends`, `clientFiles`, `packageMappings`, `deploy`, `release`, `emailTemplatesDir`, and the rest). `db/`, `emails/` and `surface.pikku.json` stay in the root.

A code package's own `pikku.config.json` carries a role and nothing else:

- `"main": true` on the one package that owns the wirings and services.
- `"addon": { ... }` (or `true`) plus a top-level `"namespace"` on each addon. `namespace` stays where `pikku new addon` already writes it, beside the `addon` block, so no addon config changes shape; the main package wires the addon under that name.

**Discovery.** `resolveWorkspacePackages` reads the `workspaces` of `rootDir/package.json` (the array or the `packages` object form, `!` negations honoured) and takes the members that have a `pikku.config.json`. It never matches `node_modules`, `dist`, `build`, `.pikku` or a dot-directory, and a directory the workspace does not list is not a member, so a nested fixture is never picked up. `findMainEntry` is the same lookup without validation, for the checks that read the raw config (`projectSourceDirs`, `defaultScaffoldDir`); `@pikku/knowledge` and `@pikku/vite` carry a small copy of it to find the scaffold directory, and follow this note.

**Rules.**

- Zero or one `main` is allowed. A project with no marker is its own main, as before. Two or more is an error naming both.
- A workspace package config with neither marker is an error, not ignored: a package that expected to be built and silently was not is worse than a refusal. It names the two markers. A package that is both `main` and `addon` is an error.
- An addon needs a `namespace` (lowercase letter first, then lowercase alphanumerics, hyphens or underscores) that is unique, and every package needs a `package.json` name. A member whose real path leaves the project root is an error.
- A config that is itself marked is a package, not a project root, and discovers nothing.
- `pikku all` at the root runs each addon in dependency order, then the main package, then assembles the cross-package outputs from the root. A pass runs with `PIKKU_PACKAGE_PASS=1`, so a package needs no `backends` or `frontends`.
- The main package's pass is the root project read from the main package. The root sets `PIKKU_ROOT_CONFIG` to its config path for that pass only; the loader then reads the root config (so every root-relative path resolves as it does at the root) and keeps three things of the main package's own: `sourceDirs` is the main package's entry, `outDir` is its `.pikku`, and `tsconfig` is its `tsconfig.json` when it has one, because that is the tsconfig that includes its `.pikku`. `addonPackages` is empty (the root ran them), and the pass checks that it is the root's main. An addon's pass gets no root config and reads its own.
- A main package's config may hold only `main` and `$schema`; any other key is refused when the root loads, and again in the main pass. Copying `environments` into the main config was the tempting workaround and fails anyway, because an environment names backends the main package does not declare.

**What this rules out:**

- A `base` or `addons` key in the root config. The loader refuses both and points at the markers; `srcDirectories` is still ignored.
- Settings in a package config. The root owns them.
- `pikku validate` treating the main package as a second project: it validates through the root that holds it.
