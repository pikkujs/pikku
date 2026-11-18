# Pikku Studio host (pikkustudio-os): host-specific notes

HOST-SPECIFIC. This describes one closed repository (pikkustudio-os) and its scripts, observed on 2026-11-10. Skip
it if you are not working in that repo. Paths are relative to its root. Items marked UNCONFIRMED were not run.

## Work in a worktree

Use worktrunk, never raw `git worktree` (a hook blocks it), and never edit the main checkout:

```bash
wt switch --create <branch> --base main --no-cd --yes
cd <worktree> && bun install --frozen-lockfile
```

Check `wt list` first: the worktree may already exist. A dirty main checkout does not matter. Commit and push nothing unless asked. `wt remove` cleans up.

## What a Studio addon adds to the skeleton

Place it at `packages/addons/<name>/`, package name `@pikkustudio/addon-<name>`, license BUSL-1.1. Mirror
`packages/addons/diffui`, the smallest one with a screen. Differences from `assets/addon-template`:

- `package.json`: `"exports": { "./screens/*": "./src/screens/*.tsx" }` (raw TSX, compiled by Studio's Vite), `"files": ["dist", "src/screens"]`,
  and a block `"studio": { "addon": "<name>", "ui": "./src", "messages": "./messages/{locale}.json" }`. `studio.addon` is required, or gen-addons throws.
  `ui` is the folder Tailwind scans; `messages` is how the catalog is merged.
- `tsconfig.json`: add `"types": ["node"]` and exclude `src/screens/**`, `src/screens.ts` (screens use Studio-only aliases such as `@/i18n/messages`).
- Also copy from diffui: `LICENSE`, `tsconfig.i18n.json` (+ the `tsc:i18n` script `tsc --noEmit -p tsconfig.i18n.json`), `.oxlintrc.json` (lint was not run).
- `wire/<name>.addon.ts`: the template's file with its import line replaced by exactly `import { wireAddon } from '@project/functions/.pikku/addon/pikku-addon-types.gen.js'`.
- `tsconfig.json` and `tsconfig.i18n.json` in diffui match the skeleton's (plus the `types`/exclude edit above); `messages/` ships `en.json` and, in diffui, `de.json` and `ar.json`; `en.json` alone builds (other locales are only warnings).
- Screens may import blocks from `@pikkustudio/blocks/blocks/*` (`Page`, `PageHead`, `EmptyState`, ...); spindle and inbox do. Prefer them to raw elements: diffui's lint config forbids raw `div`/`p`/`h1` in screens.
- A library a screen needs (three, ...) must be a root dependency (`bun add`); addons have no node_modules of their own.

## Wire it in as a local test addon

1. Add `'packages/addons/<name>'` to the one-line `TEST_ADDONS` array in `scripts/link-addon.mjs` (macOS: `sed -i '' "s#'packages/addons/diffui'\]#'packages/addons/diffui', 'packages/addons/<name>']#" scripts/link-addon.mjs`). Otherwise nothing is generated.
2. `bun install` (not frozen): creates `node_modules/@pikkustudio/addon-<name>` (the generated import goes through it). Edits `bun.lock`.
3. `node scripts/link-addon.mjs --test` (also touches `pikku-addons.lock`).
4. `bun run prebuild` (1 to 4 minutes; its `build-libs` step runs `pikku all` per addon first, so your addon's errors are mid-log: grep `build-libs: packages/addons/<name>`; huge output: redirect to a file, grep `PKU3`, `error`, `Studio app takes`).
   It builds the addon, runs `pikku all` in `packages/functions`, then `scripts/gen-addons.mjs`, `gen-routes.mjs`, `check-links.mjs`, paraglide.

`scripts/link-addon.mjs`, `bun.lock` and `pikku-addons.lock` changes are test wiring: report, do not commit unless asked.
A permanent first-party addon is wired differently (mirror `inbox`: `scripts/build-libs.mjs`, `packages/functions/src/addons/<name>.addon.ts`, `apps/studio/package.json`). UNCONFIRMED, ask the owner.

## Expected baseline noise (cloud addon not linked)

**Pass signal:** `bun run prebuild` exits 1 here by design. It passed when `Studio app takes spindle, diffui, <name>` was printed and the `/sharing` link error is the only failure; `nav.gen.json` plus `src/routes/_studio/<path>.index.tsx` are the authoritative proof (the addon's own `pikku all` succeeding proves less).

`check-links.mjs` fails `bun run prebuild` after gen-addons succeeded: `_studio.domains.tsx:6 links to /sharing`; `bun run tsc` in
`apps/studio` shows the same single TS2322. Unrelated to your addon. Because paraglide is the last prebuild step, run it yourself:
`cd apps/studio && bunx --bun paraglide-js compile --project $(node ../../scripts/inlang-project.mjs) --outdir ./src/paraglide`.
The PKU574/PKU952/PKU489 warnings from `pikku all` come from core code.

## Checks (all run, passed, in two independent fresh-agent trials)

```bash
cd apps/studio
python3 -c "import json;print([s for s in json.load(open('src/nav.gen.json'))['screens'] if s.get('addon')=='<name>'])"
ls src/routes/_studio | grep <name>          # <path>.index.tsx (project scope also routes through _studio)
grep <name> ../../packages/functions/.pikku/screens/pikku-installed-addons.gen.ts
bunx --bun vite build                         # compiles the screen TSX; a lazily imported library shows as its own client chunk
cd ../../packages/addons/<name> && bun run build
```

gen-addons prints `Studio app takes spindle, diffui, <name>` on success. Never hand-edit `*.gen.*`, `nav.gen.json` or `src/routes/_studio/*`.

## gen-addons errors (host side)

| Error | Fix |
| --- | --- |
| `... is linked but its package.json has no "studio": { "addon": ... }` | add the `studio` block |
| `... has not been built: dist/.pikku/... does not exist` | `bun run build` in the addon |
| `The nav names the icon "x", which lucide-react does not have` | kebab-case lucide icon name |
| `... clashes with core screen /x: both are at /x` | another path (only first-party addons can set `replaces`) |
| `... claims the reserved path /x` | reserved first segments: `sign-in connect p addons add-ons` and the core's unscoped ones |
| `... is scope A, but ... puts /seg in scope B` | screens under one first segment share one `scope` |
| `... sets needsApp` on a non-project screen | `needsApp` is for `scope: 'project'` |
| vite: cannot find `@pikkustudio/addon-<name>/screens/X` | `bun install` (workspace symlink) |
| screen 404s or never shows | viewer lacks the screen's `scopes`, or `studio:account` has not answered |

URL by scope: `studio` -> `/<path>`, `team` -> `/<team>/<path>`, `project` -> `/<team>/<project>[/<target>]/<path>`.

## Calling from a Studio screen

- Own functions: `usePikkuRPC().invoke('<name>:<fn>')`; the provider sets `X-Pikku-Addon`; the local backend (`pikku dev`) answered 401 `MissingSessionError` without a session (verified with curl).
- The project's data: first-party screens use `useProjectQuery` from `@pikkustudio/blocks/lib/projectRpc` (e.g. `console:getAllMeta`) and `usePikkuQuery` for `studio:*`. UNCONFIRMED at runtime for a new addon: the imports resolve and the shell provides the context, but it was not exercised.

## `app:` screens: do not use

gen-addons generates a route (`AddonIframe`) for an `app:` screen, but that iframe loads the generic Add-ons project frame
(`templates/addons-project/apps/addons-ui`, `AddonFrame.tsx`), which calls `screen.component()` and so fails for a screen
that has only `app`. Nothing serves `./<dir>`. Confirmed by source reading and by gen output, not in a browser. No CSP is set
anywhere in the repo (Tauri `csp: null`), so WebGL in a component screen is not blocked by it (UNCONFIRMED in a browser).

## Dev loop

`bun run dev:app` needs the private submodule `packages/pikkustudio-private` and cloud sign-in. Without it, after step 4:

```bash
bunx --bun pikku dev --port 4740 $(node scripts/pikku-config.mjs)     # backend boots, serves /rpc (verified)
cd apps/studio && VITE_API_PROXY=http://localhost:4740 bunx vite dev --port 4741 --strictPort   # UNCONFIRMED in a browser
```

How to obtain a signed-in local session without the cloud addon is UNCONFIRMED. Undo test wiring: `node scripts/link-addon.mjs --unlink`.
