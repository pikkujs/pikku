import { defineConfig } from 'vite'
import type { PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// Pikku design server. User source files loaded via the ./workspace symlink are
// compiled by this Vite process and share its singletons through Vite's `dedupe`
// option — no duplicate React, no Invalid hook call.
//
// The workspace symlink `./workspace -> $PIKKU_DESIGN_ROOT` is created at startup
// (see bin/start.mjs). Only @project/* packages resolve through it; module
// singletons do not.
// ─────────────────────────────────────────────────────────────────────────────

const serverDir = fileURLToPath(new URL('.', import.meta.url))
const workspaceLink = fileURLToPath(new URL('./workspace', import.meta.url))

// Resolve the symlink to its real target so server.fs.allow permits it. When the
// symlink is absent (e.g. fresh checkout, `tsc` only) fall back to the link path.
function workspaceReal(): string {
  try {
    return realpathSync(workspaceLink)
  } catch {
    return workspaceLink
  }
}

// The workspace path bin/start.mjs pointed the symlink at, as a plain string. This
// is the ONLY reliable source at config-evaluation time: a host may start this
// server before the project exists on disk, so realpathSync() on the symlink
// throws and workspaceReal() silently degrades to the link path. server.fs.allow
// is a boot-time snapshot, so that degraded value permanently locked the real
// workspace out and every /@fs read of a user file 403'd.
const workspaceConfigured = process.env.PIKKU_DESIGN_ROOT || workspaceReal()

const ws = (sub: string) => fileURLToPath(new URL(`./workspace/${sub}`, import.meta.url))

// Map every @project/* workspace package to its real directory by reading the
// root package.json `workspaces` globs and each candidate's package.json `name`.
//
// We cannot resolve @project/* through a fixed node_modules path: bun links a
// workspace dependency into the DEPENDENT package's node_modules (e.g.
// apps/app/node_modules/@project/…), not the workspace root, so
// workspace/node_modules/@project never exists. Package names also differ from
// their directory names (packages/theme → @project/theme), so
// only the package.json name is authoritative. Aliasing to the package DIRECTORY
// keeps Vite's own resolver in charge, so package.json `exports` still applies.
function discoverProjectPackages(): { name: string; dir: string }[] {
  const root = ws('')
  let globs: string[] = ['apps/*', 'packages/*', 'design/*']
  try {
    const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
    if (Array.isArray(rootPkg?.workspaces) && rootPkg.workspaces.length > 0) {
      globs = rootPkg.workspaces
    }
  } catch (error) {
    // No workspace root (fresh checkout / `tsc` with no symlink) — fall back to
    // the conventional layout above rather than failing the whole config.
    console.warn(`[design-server] no workspace package.json, using default globs:`, error)
  }

  const found: { name: string; dir: string }[] = []
  const addDir = (dir: string) => {
    try {
      const name = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))?.name
      if (typeof name === 'string' && name.startsWith('@project/')) found.push({ name, dir })
    } catch {
      // Not a package (no/invalid package.json) — skip it silently; globs match
      // plenty of non-package dirs and that is expected, not an error.
    }
  }

  for (const glob of globs) {
    if (glob.startsWith('!')) continue // negations only ever subtract; ignore
    if (glob.endsWith('/*')) {
      const parent = join(root, glob.slice(0, -2))
      try {
        for (const entry of readdirSync(parent, { withFileTypes: true })) {
          if (entry.isDirectory()) addDir(join(parent, entry.name))
        }
      } catch {
        // Declared workspace dir that does not exist (e.g. `design/*` in a
        // project with no design packages) — nothing to add.
      }
    } else if (!glob.includes('*')) {
      addDir(join(root, glob))
    }
  }
  return found
}

// Resolve @project/* LAZILY, at import time rather than at config-evaluation
// time. This ordering is not incidental: supervisord starts the design server as
// soon as the container is up, while the user's repo is cloned and installed a
// few seconds LATER. A `resolve.alias` list built from discoverProjectPackages()
// at config load therefore snapshots an empty workspace and stays empty forever —
// Vite only re-evaluates the config when the config file itself changes — so
// every @project/* import 500s for the life of the sandbox.
//
// Resolving per-request also means a package added mid-session (a new
// packages/* dir) is picked up without restarting the server: an unknown name
// invalidates the cache and re-discovers once before giving up.
function projectPackagesPlugin(): PluginOption {
  let cache: Map<string, string> | null = null

  // Longest-prefix match so `@project/x/base.json` lands inside `@project/x`.
  const dirFor = (source: string): string | undefined => {
    if (!cache) cache = new Map(discoverProjectPackages().map((p) => [p.name, p.dir]))
    for (const [name, dir] of cache) {
      if (source === name) return dir
      if (source.startsWith(name + '/')) return dir + source.slice(name.length)
    }
    return undefined
  }

  return {
    name: 'pikku-design:project-packages',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.startsWith('@project/')) return null
      let target = dirFor(source)
      if (!target) {
        cache = null // workspace may have appeared (or grown) since we last looked
        target = dirFor(source)
      }
      if (!target) return null
      // Hand the real path back to Vite's resolver so the package's own
      // package.json `exports`/`main` still decides the entry point.
      return this.resolve(target, importer, { ...options, skipSelf: true })
    },
  }
}

function shadcdnDir(): string | null {
  try {
    return dirname(createRequire(import.meta.url).resolve('@pikku/shadcdn/package.json'))
  } catch {
    const sibling = fileURLToPath(new URL('../../shadcdn', import.meta.url))
    return existsSync(sibling) ? sibling : null
  }
}

function stockStoriesPlugin(): PluginOption {
  const id = 'virtual:stock-stories'
  return {
    name: 'pikku-design:stock-stories',
    resolveId: (source) => (source === id ? '\0' + id : null),
    load(loaded) {
      if (loaded !== '\0' + id) return null
      const dir = shadcdnDir()
      const files = dir
        ? readdirSync(join(dir, 'ui')).filter((f) => f.endsWith('.stories.tsx'))
        : []
      const lines = files.map((f, i) => `import * as s${i} from ${JSON.stringify(join(dir!, 'ui', f))}`)
      const entries = files.map((f, i) => `  ${JSON.stringify('/shadcdn/' + f)}: s${i},`)
      return `${lines.join('\n')}\nexport default {\n${entries.join('\n')}\n}\n`
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Artifact index — the LIVE directory listing of artifacts/.
//
// This is deliberately an endpoint and not an `import.meta.glob`. A glob is
// resolved at TRANSFORM time, so the list is baked into the module the browser
// already loaded; a file the design agent writes afterwards only surfaces if
// Vite's HMR websocket reaches the client and forces a reload. In a sandbox that
// socket rides through Caddy on a sub-path, so when it doesn't connect the nav
// silently keeps showing the boot-time list — the artifact exists on disk and
// never appears. Reading the directory per request removes that dependency
// entirely: the shell polls this and always sees what is actually there.
//
// Files are `<slug>-vN.html` and are grouped by slug: one ROW per slug, whose
// `file` is the highest N. Older versions stay listed so the user can look back
// at what they were shown — the agent never overwrites one.
//
// The page itself is served RAW by the companion middleware below, not through
// Vite's transform pipeline: an artifact is self-contained by contract, and
// handing it to the HTML plugin would inject the dev client into someone else's
// document.
// ─────────────────────────────────────────────────────────────────────────────
const ARTIFACT_FILE_RE = /^([a-z0-9][a-z0-9-]*)-v(\d+)\.html$/i
const ARTIFACT_TITLE_RE = /<title[^>]*>([^<]*)<\/title>/i
const ARTIFACT_OPTION_RE = /data-artifact-option\s*=\s*"([^"]+)"/g

type ArtifactRow = {
  id: string
  file: string
  name: string
  versions: string[]
  options: string[]
}

function readArtifacts(dir: string): ArtifactRow[] {
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return []
  }
  const bySlug = new Map<string, { file: string; version: number }[]>()
  for (const file of files) {
    const match = ARTIFACT_FILE_RE.exec(file)
    if (!match) continue
    const slug = match[1]!.toLowerCase()
    const list = bySlug.get(slug) ?? []
    list.push({ file, version: Number(match[2]) })
    bySlug.set(slug, list)
  }
  return [...bySlug.entries()]
    .map(([id, entries]) => {
      const sorted = entries.sort((a, b) => b.version - a.version)
      const file = sorted[0]!.file
      let source = ''
      try {
        source = readFileSync(join(dir, file), 'utf-8')
      } catch (error) {
        // Half-written file mid-agent-edit: fall back to the slug rather than
        // dropping the row (it will re-read on the next poll).
        console.warn(`[design-server] cannot read artifact ${file}:`, error)
      }
      return {
        id,
        file,
        name: ARTIFACT_TITLE_RE.exec(source)?.[1]?.trim() || id,
        versions: sorted.map((entry) => entry.file),
        options: [...source.matchAll(ARTIFACT_OPTION_RE)].map((match) => match[1]!),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function artifactIndexPlugin(): PluginOption {
  return {
    name: 'pikku-design:artifact-index',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const rel = path.startsWith(base) ? path.slice(base.length) : path.replace(/^\//, '')
        // Resolve per request: the workspace is cloned after this server boots,
        // so a path captured at config time can point at nothing.
        const dir = join(workspaceReal(), 'artifacts')
        if (rel === 'artifacts.json') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ dir, artifacts: readArtifacts(dir) }))
          return
        }
        const served = /^artifact\/([^/]+)$/.exec(rel)
        if (!served) return next()
        const file = decodeURIComponent(served[1]!)
        if (!ARTIFACT_FILE_RE.test(file)) {
          res.statusCode = 400
          res.end('not an artifact filename')
          return
        }
        let source: string
        try {
          source = readFileSync(join(dir, file), 'utf-8')
        } catch {
          res.statusCode = 404
          res.end('no such artifact')
          return
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(source)
      })
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Importer-aware `@`.
//
// This server AND every user app both alias `@` to "my own src". A single static
// alias can only pick one, and it picked ours — so a user component importing
// `@/i18n/messages` resolved into THIS server's src and failed. That is why the
// Library lens could never render a real app component, only the kit's (which
// deliberately uses relative imports).
//
// `find: /^@\//` with an identity replacement leaves the id untouched and hands
// the decision to `customResolver` — the only alias hook that sees the importer.
// A file under ./workspace resolves against its OWN package's src (nearest
// ancestor with a package.json, so packages/* works too); anything else is ours.
// ─────────────────────────────────────────────────────────────────────────────
const serverSrc = fileURLToPath(new URL('./src', import.meta.url))

function workspacePackageSrc(importer: string | undefined): string | null {
  if (!importer) return null
  const file = importer.split('?')[0]
  const root = [workspaceReal(), workspaceLink].find((r) => file.startsWith(r + sep))
  if (!root) return null
  let dir = dirname(file)
  while (dir.startsWith(root + sep)) {
    if (existsSync(join(dir, 'package.json'))) return join(dir, 'src')
    dir = dirname(dir)
  }
  return null
}

// Module-level i18n map: omId → { propName → i18nKey }
// Populated by the Babel plugin during transforms; cleared per-file on HMR.
const omI18nMap: Record<string, Record<string, string>> = {}
// Tracks which omIds belong to each file so HMR can clear stale entries.
const fileOmIds = new Map<string, Set<string>>()

// Babel plugin: stamp data-om-id="file:line:col" on every host JSX element so the
// console preview can map a clicked DOM node back to its source (Alt+click).
// Also extracts t('i18n.key') call expressions from JSX attributes and records
// them in omI18nMap so the console DesignPanel can show live-updated i18n tokens.
function omIdPlugin(api: any) {
  const t = api.types
  // Paths must be relative to the workspace root so the console's JSX-prop edits
  // can open them against the project root. The design-server reads workspace files
  // via a ./workspace symlink, so stripping cwd leaves "workspace/apps/app/src/…" —
  // one level too deep.
  const workspaceDir: string = (() => {
    if (process.env.PIKKU_DESIGN_ROOT) return process.env.PIKKU_DESIGN_ROOT
    try {
      return realpathSync(workspaceLink)
    } catch {
      return ''
    }
  })()
  const prefix = workspaceDir ? workspaceDir + '/' : ''
  // Extract an i18n key from a call expression, or null. Paraglide only:
  // m.key() / m['key']() — the message-function name is the flat key
  // (e.g. landing__title).
  const i18nKeyOf = (expr: any): string | null => {
    if (!t.isCallExpression(expr)) return null
    const callee = expr.callee
    if (
      t.isMemberExpression(callee) &&
      t.isIdentifier(callee.object) &&
      callee.object.name === 'm'
    ) {
      if (!callee.computed && t.isIdentifier(callee.property)) return callee.property.name
      if (callee.computed && t.isStringLiteral(callee.property)) return callee.property.value
    }
    return null
  }
  return {
    visitor: {
      Program: {
        enter(programPath: any, state: any) {
          // Per-file counter for the no-loc fallback below.
          programPath.__omSeq = 0
          // Clear stale entries for this file before re-extracting (HMR cycle).
          const filename: string | undefined = state.filename
          if (!filename) return
          const ids = fileOmIds.get(filename)
          if (ids) {
            for (const id of ids) delete omI18nMap[id]
            ids.clear()
          }
        },
      },
      JSXOpeningElement(path: any, state: any) {
        if (!state.filename) return
        const { name } = path.node.name
        if (typeof name !== 'string' || name === 'Fragment') return
        // Strip any query suffix (route splitting emits virtual modules like
        // `index.tsx?tsr-split=component`) so the om-id stays a clean source path
        // that resolveWorkspacePath can open. Mirrors the sandbox app's plugin.
        const rawFile = String(state.filename).split('?')[0]
        const file = prefix && rawFile.startsWith(prefix) ? rawFile.slice(prefix.length) : rawFile
        // Prefer the real source location; fall back to a per-file sequence when a
        // prior transform regenerated the AST without loc — an element with no om-id
        // is unselectable, which reads as "the inspector is broken".
        const program = path.findParent((p: any) => p.isProgram())
        const omId = path.node.loc
          ? `${file}:${path.node.loc.start.line}:${path.node.loc.start.column}`
          : `${file}#${program ? program.__omSeq++ : 0}`
        path.node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier('data-om-id'), t.stringLiteral(omId)),
        )
        path.node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier('data-om-component'), t.stringLiteral(name)),
        )
        // Extract i18n keys from m.key() calls in JSX attributes.
        const i18nTokens: Record<string, string> = {}
        for (const attr of path.node.attributes) {
          if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
          const val = attr.value
          if (!t.isJSXExpressionContainer(val)) continue
          const key = i18nKeyOf(val.expression)
          if (key !== null) i18nTokens[attr.name.name as string] = key
        }
        // Also scan JSXElement children — captures {m.key()} text nodes.
        const jsxChildren: any[] = path.parent?.children ?? []
        for (const child of jsxChildren) {
          if (!t.isJSXExpressionContainer(child)) continue
          const key = i18nKeyOf(child.expression)
          if (key !== null) {
            i18nTokens['children'] = key
            break
          }
        }
        if (Object.keys(i18nTokens).length > 0) {
          omI18nMap[omId] = i18nTokens
          if (!fileOmIds.has(state.filename)) fileOmIds.set(state.filename, new Set())
          fileOmIds.get(state.filename)!.add(omId)
          // Stamp data-om-i18n so the in-browser dblclick handler can read the key
          // without a round-trip to the Vite middleware.
          //
          // As an EXPRESSION, not a JSX string literal: the value is JSON, so it
          // contains double quotes, and Babel prints those inside a JSX attribute
          // as `\"` — which is not legal JSX. esbuild re-parses this file after
          // Babel (plugin-react leaves the JSX transform to it in build), so a
          // string literal here fails the build outright with "Unexpected
          // backslash in JSX element". An expression container prints a normal
          // JS string and yields the identical DOM attribute.
          path.node.attributes.push(
            t.jsxAttribute(
              t.jsxIdentifier('data-om-i18n'),
              t.jsxExpressionContainer(t.stringLiteral(JSON.stringify(i18nTokens))),
            ),
          )
        }
      },
    },
  }
}

// Behind a reverse proxy this serves under a sub-path (e.g. /_frontend/design/).
const base = process.env.PIKKU_DESIGN_BASE || '/'
const hmrPath = process.env.PIKKU_DESIGN_HMR_PATH
const origin = process.env.PIKKU_DESIGN_ORIGIN

function hmrClientPort(): number | undefined {
  if (!origin) return undefined
  try {
    const url = new URL(origin)
    if (url.port) return Number(url.port)
    return url.protocol === 'https:' ? 443 : 80
  } catch {
    return undefined
  }
}

/**
 * Which scheme the HMR client dials, or `undefined` to let it match the page.
 *
 * This is not a live-reload nicety — the Design tab does not work without it. Vite
 * pre-bundles dependencies at BOOT, which in a sandbox is long before the user's repo
 * is cloned and before the user's app exists. The first app-story import discovers
 * deps the optimizer never saw, so Vite re-optimizes and every chunk gets a new `?v=`
 * hash. The already-loaded page is still holding the OLD React, and the only thing
 * that reconciles the two is the `full-reload` Vite pushes down the HMR socket.
 *
 * Hardcoding `ws` broke exactly that. Sandboxes are served over HTTPS through Caddy,
 * so the browser refused the `ws://` upgrade as mixed content, the reload never
 * arrived, and the freshly imported module ran against a second copy of React —
 * surfacing as "Invalid hook call" and then `Cannot read properties of null (reading
 * 'use')` with the whole lens replaced by the error
 * boundary. The story file itself was perfectly good; nothing could render it.
 *
 * Leaving the protocol unset is the fix rather than hardcoding `wss`: Vite's client
 * then derives it from `location.protocol`, which is right for the HTTPS sandbox and
 * still right for a plain-HTTP local run. Only an explicit origin overrides it.
 */
function hmrProtocol(): 'ws' | 'wss' | undefined {
  if (!origin) return undefined
  try {
    return new URL(origin).protocol === 'https:' ? 'wss' : 'ws'
  } catch {
    return undefined
  }
}

export default defineConfig({
  base,
  plugins: [
    react({ babel: { plugins: [omIdPlugin] } }),
    tailwindcss(),
    projectPackagesPlugin(),
    stockStoriesPlugin(),
    artifactIndexPlugin(),
    {
      name: 'om-i18n-map-server',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // A proxy may forward the sub-path prefix intact, so match the suffix.
          if (!req.url?.endsWith('/om-i18n-map.json')) return next()
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(omI18nMap))
        })
      },
    },
  ],
  resolve: {
    alias: [
      // `@/…` — ours or the importing workspace package's, see workspacePackageSrc.
      {
        find: /^@\//,
        replacement: '@/', // identity: customResolver does the real work
        async customResolver(source, importer, options) {
          const base = workspacePackageSrc(importer) ?? serverSrc
          return this.resolve(join(base, source.slice(2)), importer, {
            ...options,
            skipSelf: true,
          })
        },
      },
      // @project/* is NOT aliased here — an alias list is a snapshot taken when
      // this config is evaluated, and the workspace may appear AFTER the server
      // boots. See projectPackagesPlugin.
    ],
    // Ensure user source files compiled by this Vite process share the same
    // singleton instances installed in the design-server's own node_modules.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // @project/* is loose user source (not a built package) — let Vite transpile
    // it rather than pre-bundling, and dedupe the singletons from the workspace.
    exclude: ['@project/theme'],
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PIKKU_DESIGN_PORT) || 7110,
    strictPort: true,
    allowedHosts: true,
    fs: {
      // Permit reading the server itself and the (symlinked) workspace it renders.
      // All three forms are listed because any one of them can be what Vite ends
      // up checking, and `workspaceConfigured` is the only one that survives the
      // repo not existing yet (see its definition).
      allow: [serverDir, ...(shadcdnDir() ? [shadcdnDir()!] : []), workspaceLink, workspaceReal(), workspaceConfigured],
    },
    hmr: hmrPath
      ? { protocol: hmrProtocol(), path: hmrPath, clientPort: hmrClientPort() }
      : undefined,
  },
})
