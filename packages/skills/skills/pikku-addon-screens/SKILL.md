---
name: pikku-addon-screens
description: >-
  Build a Pikku addon that ships a screen for Pikku Studio: package layout, `definePlugin` screens, message
  keys, scopes, calling the addon's functions with `usePikkuRPC`, `wireAddon({ ui: true })`, `pikku new addon
  --ui`, and the build errors you will meet. TRIGGER when: asked for an addon with a screen/page/nav entry,
  when editing a `definePlugin` call or `src/screens.ts`, or when a screen must call an addon function. DO NOT
  TRIGGER for addons with no screens (use pikku-addon), for the screens of a user's own app (use pikku-ui and
  pikku-react), or for message wording only (use pikku-i18n).
installGroups: [core]
---

# Addon screens

An addon is a Pikku package of functions and services. With `definePlugin` it can also bring **screens**: pages
a host (Pikku Studio) mounts, each with a route and an optional nav entry. This skill is the screen half; the
generic addon API (`wireAddon` fields, `uses`, services, db tables, remote functions) is in `pikku-addon`.
Read that skill for anything not about screens.

## The shape of it

1. The addon declares screens in `src/screens.ts` with `definePlugin({ title, screens })`.
2. Each screen is a React component the addon ships. It calls the addon's functions through `usePikkuRPC()`.
3. The host app wires the addon with `wireAddon({ name, package, expose: true, ui: true })`. `ui: true` mounts the screens.
4. `pikku all` reads `definePlugin` **statically** and fails the build on what a host cannot render.

A copy-ready skeleton is in `assets/addon-template/` (files end in `.tmpl`; drop the suffix, rename `hello`, and keep the folder layout).

## Layout

```text
<addon>/
  package.json          exports: "." , "./.pikku/*", "./screens/*"; peerDeps @pikku/core, react, zod, @pikku/react
  pikku.config.json     "addon" block is metadata (displayName, description) only
  tsconfig.json         jsx react-jsx; #pikku/* paths
  messages/en.json      every message key a title uses (required), plus the screens' own
  types/application-types.d.ts
  src/index.ts          export the functions; import './scopes.js'
  src/scopes.ts         defineScope
  src/services.ts       pikkuAddonServices(async () => ({}))
  src/functions/*.function.ts
  src/screens.ts        definePlugin
  src/screens/*.tsx     default-exported components
```

Without `types/application-types.d.ts` the build fails with a misleading "No CoreUserSession found"; copy the file as is.
A screen-only addon is fine: `src/index.ts` may hold only `import './scopes.js'` and `services.ts` may return `{}`.

`pikku new addon <name> --ui [--dir <dir>]` scaffolds this. Read its output before trusting it (observed on the current CLI):
it names the package `@pikku/addon-<name>` in a folder `addon-<name>`, runs a build, and its starter function
(`pikkuSessionlessFunc` with `scopes`) fails `tsc` with TS2353, because only `pikkuFunc` accepts `scopes`.
It exports compiled screens (`./screens/*` -> `./dist/src/screens/*.js`); whether a host can use compiled
screens versus raw `.tsx` is host-specific (see Hosts). Rename the package and fix the function when you use it.

## Screens (`src/screens.ts`)

See `assets/addon-template/src/screens.ts.tmpl`. Every field is read from the AST, so each must be a literal:

- `path`: `/hello`, params as `:id` (`/hello/:id`, delivered in the component's `params`). Unique within the addon (PKU357).
- `title`: a **message key** in `messages/en.json` (PKU358 if missing). It is also the nav label. The top-level `title` is the addon's name, also a key.
- `scope`: `'studio'`, `'team'` or `'project'`: where the host mounts the URL.
- `nav` (optional): `{ area: 'rail' | 'team' | 'project' | 'account', icon, order, badge? }`. No `nav` = routed but not listed. `badge` must name one of the addon's functions returning a count (PKU359). `icon` is a host icon name; Studio uses lucide names in kebab-case.
- `scopes`: scopes the viewer needs to **see** the screen. This hides it; it is not access control (below).
- `needsApp`: project screens only; the screen needs the project's app running.
- `layout: 'bare'`: no host shell. `replaces: true`: take over a core screen (first-party addons only; the host enforces it).
- Exactly one of `component: () => import('./screens/X.js')` (a literal lazy import) or `app` (see Heavy screens). Anything else is PKU345.

## Calling the addon's functions

Inside the screen use the Pikku client from `@pikku/react`; the RPC name is `<name in wireAddon>:<exported function name>`:
`usePikkuRPC().invoke('hello:helloHello')` (see `assets/addon-template/src/screens/Home.tsx.tmpl`; `usePikkuQuery` /
`usePikkuMutation` work too where the host's generated client is available). For the call to reach the function:

- the function declares `expose: true` **and** the host's `wireAddon` sets `expose: true` (nothing in an addon is callable over `/rpc` until both opt in);
- the call carries a session. The host's provider sends the addon name with the call; a signed-out call fails with 401 `MissingSessionError`.

If the addon's *backend* calls another addon (`rpc.invoke('other:fn')`), declare it in the addon's `package.json`
`"pikku": { "uses": { "other": "<package>@^x" } }` and map it in the host's `wireAddon({ uses })` (PKU348/347/355; see `pikku-addon`).

## Scopes

Define them once and put them on both sides:

1. `src/scopes.ts`: `defineScope({ hello: { displayName, description, scopes: { read: { description } } } })`, imported from `src/index.ts`.
2. The function: `pikkuFunc({ scopes: ['hello:read'], ... })`. This is the enforcement. Use `pikkuFunc`, not `pikkuSessionlessFunc`.
3. The screen: `scopes: ['hello:read']` hides it and its nav entry from viewers without the scope, until the host knows the viewer's scopes.

Skipping step 2 leaves a hidden screen over an open function.

## Messages

Titles are keys; there is no field for the text. Put every key in `messages/en.json` (other locales warn when a key is missing).
Prefix keys with the addon name (`hello_home__title`) so they cannot collide with the host's. In a component, use the host's
generated message functions (`m.hello_home__title()`), wrap runtime data in `asI18n(...)`, and never put a string literal in JSX: this is Pikku's i18n rule (see `pikku-i18n`).

## Heavy screens (3D, canvas, large libraries)

Use `component` and load the library inside the screen with a dynamic `import()` (in an effect). The screen is already
a lazy chunk and the library becomes a second one; a bundled build lists it as its own file, which is how to check it.
Add the library to the host project's dependencies and as a peerDependency of the addon, plus its types if it ships none (three needs `@types/three` at the host root).
Recipe that built and bundled as its own chunk: `import('three')` in a `useEffect`, a `cancelled` flag checked after the await, `renderer.setAnimationLoop` for the loop, and in the cleanup stop the loop and dispose the renderer, geometry and material. Name the screen file distinctively (`CubeHome.tsx`, not `Home.tsx`) so its chunk is easy to find. Not rendered in a browser in testing.

`app: '<dir>'` is accepted by the inspector (it types it as "a static program in a frame"), but do not rely on it:
in Pikku Studio's host as inspected, a screen with `app` gets a route and nav entry yet is rendered by a generic
frame that only knows `component` screens. UNCONFIRMED in a browser; ask the host's owner before using it.

## Verify

```bash
pikku all          # in the addon: PKU345/346/357/358/359 surface here
pikku all          # in the host, after wireAddon: PKU346 if ui: true but no definePlugin; PKU574 warnings name unprotected exposed functions
```

Then build the host and check that the route and nav entry exist. Mechanics are host-specific:
`references/studio-host.md` covers Pikku Studio's own repository (`pikkustudio-os`), the only host this skill was exercised against.

| Code | Meaning |
| --- | --- |
| PKU345 | a `definePlugin` field is not a literal; `component` must be `() => import('<literal>')` |
| PKU346 | `wireAddon({ ui: true })` but the package declares no screens |
| PKU357 | two screens of the addon share a path |
| PKU358 | a title key is missing from `messages/en.json` |
| PKU359 | `nav.badge` names no function of the addon |

## Hosts

Studio's own addons ship screens as raw `.tsx` (`"./screens/*": "./src/screens/*.tsx"`) that the host compiles with its
own Tailwind and message module, and add a `"studio"` block to `package.json`. That is host-specific: read
`references/studio-host.md` before wiring into Pikku Studio's repo.
