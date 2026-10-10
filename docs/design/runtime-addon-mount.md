# Runtime addon mount

`@pikku/core/mount` adds the wirings of an installed package to a running
process, and removes them again. `mountCLICommands` was the first instance of
this; `mountPackage` generalises it to HTTP routes and MCP tools, resources and
prompts.

## Use cases

- Studio extensions installed into a running instance.
- Deploy targets that add commands (`pikku deploy <target>`) without a rebuild.
- Dev-server hot-add of a package under development.
- Long-lived team assistants that gain capabilities while running.

It is for long-lived Node-style processes. It is not for serverless or edge
deployments: those bundle their wirings at build time and have no process to
mutate.

## How it works

Every runner already resolves a wiring's function from `meta.packageName`, so a
mount does not change the runners. It does three things:

1. Stamps `packageName` onto the wiring's metadata and writes it to the host
   tables (`http.meta` / `http.routes`, `mcp.toolsMeta` / `resourcesMeta` /
   `promptsMeta`, the CLI program meta).
2. Checks that the package has registered the function, either from its
   generated bootstrap (imported before the mount) or from a `func` passed with
   the wiring.
3. Resets the HTTP route matcher, which compiles its tables once.

The function itself runs through `runPikkuFunc` with the package name, so the
package's own schemas, permissions, `auth` and scoped services apply. A
package's secrets are limited to the ones it declared; the host's are not
readable by it.

## API

```ts
import { mountPackage, unmountPackage } from '@pikku/core/mount'

const mounted = mountPackage({
  name: 'studio-ext',
  packageName: '@acme/studio-extension',
  wirings: {
    cli: { program: 'pikku', name: 'ext', meta, commands },
    http: [{ meta: routeMeta, wiring: { auth: false } }],
    mcp: { tools: { ext_tool: { meta: toolMeta } } },
  },
})

mounted.added
mounted.unmount()
unmountPackage('studio-ext')
```

`mountHTTPRoutes`, `mountMCP` and `mountCLICommands` are also exported for a
single wiring. Each returns `{ added, unmount }`, and `unmount()` returns what
it removed. Unmounting twice is a no-op.

## Collisions

A mount throws, and changes nothing, when:

- an HTTP route has the same method and shape as an existing one (`/users/:id`
  collides with `/users/:name`), or is mounted twice in one call;
- an MCP tool, resource or prompt name is already defined;
- a CLI command name is already defined on the program;
- a package extension with the same `name` is already mounted;
- the package has not registered the function a wiring uses.

`mountPackage` rolls back wirings it already mounted when a later one fails.

## Unmount

Unmount removes only entries it still owns, restores function configs it
replaced, drops the matcher cache, and clears the package's cached singleton
services so a remount builds them again. Package function registrations that
came from the package's own bootstrap stay in place.

## Limits

- Build-time analysis does not see mounted wirings: no generated types, no
  generated client, no OpenAPI, no `.pikku` manifests.
- Tag and global middleware resolve at call time from state, so mounted routes
  get host global middleware, but middleware metadata stamped at codegen is only
  what the extension supplies in its `meta.middleware`.
- Wildcard and regex route overlap is not detected; only parameter-shape
  equality is.
- MCP servers that snapshot tools at startup (for example a list sent once at
  `initialize`) will not announce a mounted tool until they re-read the meta.
  The runner dispatches it correctly.
- Scheduler and queue: the runners honour `meta.packageName`, but the services
  that tick or consume read the registries once at start, so a mount would
  register a task nothing triggers. Not implemented.
- Channels: route matching includes channels, but live WebSocket adapters are
  bound at startup. Not implemented.
- The record of mounted extensions is per process and is not part of
  `resetPikkuState`; tests unmount in teardown.

## CLI extensions

The `pikku` binary mounts packages that declare themselves as CLI extensions.
A dependency of `@pikku/cli` is an extension when its `package.json` has
`"pikku": { "cli": { "name": "<group>" } }` and exports `./cli`, whose
`cliExtension` is `{ name, packageName, meta, commands }`.

- Discovery reads the CLI's own dependencies; nothing is configured.
- The first non-flag argument decides what loads: a built-in command loads no
  extension, no command or only flags (`--help`) loads all, and `<group>` loads
  only that extension.
- The extension's `@pikku/core` must satisfy its declared peer range, and when
  it resolves to a different copy than the CLI's it must be the same version.
  `pikkuState` lives on `globalThis`, so two copies of one version share state;
  two versions would corrupt it, so the mount is refused (an error for
  `pikku <group> ...`, a warning for `--help`).
- An installed extension whose `./cli` entry is not built is skipped silently
  when listing and is an error when named.
- Compiled `bun --compile` binaries have no `node_modules` to discover from and
  carry no extensions.
