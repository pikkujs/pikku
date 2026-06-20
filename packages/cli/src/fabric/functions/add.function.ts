import { z } from 'zod'
import { readFile, mkdir, rm, writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'

export const FabricAddInput = z.object({
  id: z.string(),
  dir: z.string().optional(),
  apiUrl: z.string().optional(),
})

export const FabricAddOutput = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  path: z.string(),
})

/** Walk up from cwd to find the project root (the dir with package.json). */
function resolveProjectRoot(): string {
  let dir = process.cwd()
  while (true) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return process.cwd()
    dir = parent
  }
}

/** Read `addons.addonDir` from pikku.config.json if present (json only). */
async function readAddonDirFromConfig(
  root: string
): Promise<string | undefined> {
  const cfgPath = join(root, 'pikku.config.json')
  if (!existsSync(cfgPath)) return undefined
  try {
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8')) as {
      addons?: { addonDir?: string }
    }
    return cfg.addons?.addonDir
  } catch {
    return undefined
  }
}

/** Ensure the root package.json `workspaces` glob covers `<addonDir>/*`, so a
 *  later `yarn install` symlinks the addon into node_modules and `wireAddon`
 *  resolves it by package name. */
async function ensureWorkspaceGlob(
  root: string,
  addonDir: string
): Promise<void> {
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
    workspaces?: string[] | { packages?: string[] }
  }
  const glob = `${addonDir}/*`
  const objectForm = !Array.isArray(pkg.workspaces) && pkg.workspaces != null
  const list = Array.isArray(pkg.workspaces)
    ? pkg.workspaces
    : (pkg.workspaces?.packages ?? [])
  if (list.includes(glob)) return
  list.push(glob)
  if (objectForm) (pkg.workspaces as { packages?: string[] }).packages = list
  else pkg.workspaces = list
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
}

/** Record install provenance in pikku-addons.json — CLI-owned, so we know which
 *  registry package + version a folder came from even after the user forks it. */
async function recordInstall(
  root: string,
  name: string,
  rec: { id: string; version: string }
): Promise<void> {
  const p = join(root, 'pikku-addons.json')
  let data: Record<string, { id: string; version: string }> = {}
  if (existsSync(p)) {
    try {
      data = JSON.parse(await readFile(p, 'utf8'))
    } catch {
      data = {}
    }
  }
  data[name] = rec
  await writeFile(p, JSON.stringify(data, null, 2) + '\n')
}

/**
 * Install a community-registry addon shadcn-style: the source is copied into
 * `<addonDir>/<name>/` (default `addons/`, top-level so it sits outside the
 * app's TS scan and never collides with the project's own CoreConfig). The dir
 * is registered as a yarn workspace, so `yarn install` symlinks it into
 * node_modules and `wireAddon({ package })` resolves it by name unchanged.
 *
 * Provenance (registry id + version) is recorded in pikku-addons.json, which is
 * CLI-owned and survives the user editing/forking the copied source.
 */
export const FabricAdd = pikkuSessionlessFunc({
  description:
    'Install an addon from the Fabric community registry into addons/ (shadcn-style).',
  input: FabricAddInput,
  output: FabricAddOutput,
  func: async (_services, { id, dir, apiUrl: apiUrlOverride }) => {
    const ctx = await resolveApiContext({ apiUrlOverride })

    // 1. resolve a presigned download URL (public read)
    const metaRes = await fetch(
      `${ctx.apiUrl}/registry/packages/${encodeURIComponent(id)}/download`
    )
    if (!metaRes.ok)
      throw new Error(
        `download lookup failed → ${metaRes.status}: ${await metaRes.text()}`
      )
    const { url } = (await metaRes.json()) as { url: string }

    // 2. fetch the artifact
    const dl = await fetch(url)
    if (!dl.ok) throw new Error(`artifact fetch failed → ${dl.status}`)
    const artifact = Buffer.from(await dl.arrayBuffer())

    const root = resolveProjectRoot()
    const addonDir = dir ?? (await readAddonDirFromConfig(root)) ?? 'addons'
    const addonRoot = isAbsolute(addonDir) ? addonDir : join(root, addonDir)

    // 3. stage inside addonRoot (same filesystem — no EXDEV on the final move)
    //    and strip npm-pack's `package/` prefix. The dir name isn't known until
    //    we read the artifact's package.json.
    await mkdir(addonRoot, { recursive: true })
    const staging = join(addonRoot, `.pikku-add-${id}-${Date.now()}`)
    await mkdir(staging, { recursive: true })
    const tmp = join(tmpdir(), `pikku-add-${id}.tgz`)
    await writeFile(tmp, artifact)
    try {
      execFileSync('tar', ['-xzf', tmp, '-C', staging, '--strip-components=1'])
      await rm(tmp, { force: true })

      const pkg = JSON.parse(
        await readFile(join(staging, 'package.json'), 'utf8')
      ) as { name?: string; version?: string }
      if (!pkg.name)
        throw new Error('artifact package.json is missing a "name" field')
      const version = pkg.version ?? '0.0.0'

      // shadcn copy: folder is the last segment of the (scoped) package name
      const folder = pkg.name.split('/').pop()!
      const target = join(addonRoot, folder)
      await rm(target, { recursive: true, force: true })
      await rename(staging, target)

      // 4. register the workspace glob + record provenance (skip glob for an
      //    absolute --dir override — it can't be a relative workspace pattern)
      if (!isAbsolute(addonDir)) await ensureWorkspaceGlob(root, addonDir)
      await recordInstall(root, pkg.name, { id, version })

      console.log(`[fabric] installed ${pkg.name}@${version} → ${target}`)
      console.log('[fabric] run `yarn install` to link it into node_modules')
      return { id, name: pkg.name, version, path: target }
    } finally {
      await rm(staging, { recursive: true, force: true })
      await rm(tmp, { force: true })
    }
  },
})
