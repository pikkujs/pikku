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

/**
 * Install a community-registry package into the project's `node_modules` so it
 * resolves by package name — the location `wireAddon({ package })` looks it up
 * (`require.resolve('<package>/.pikku/...')`). Resolves a presigned download URL
 * (public — no auth), fetches the artifact, and unpacks it into
 * `<root>/node_modules/<package-name>/`. The package name comes from the
 * artifact's own package.json (npm-pack nests contents under `package/`, which
 * `--strip-components=1` removes). `--dir` overrides the node_modules root.
 */
export const FabricAdd = pikkuSessionlessFunc({
  description:
    'Install a package from the Fabric community registry into the project.',
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

    // 3. unpack into a staging dir *inside* the install root (so the final
    //    move is same-filesystem — no EXDEV), stripping the npm `package/`
    //    prefix. The root is known up front; the package subdir isn't (its
    //    name lives in the artifact's package.json).
    const root = dir
      ? isAbsolute(dir)
        ? dir
        : join(process.cwd(), dir)
      : join(resolveProjectRoot(), 'node_modules')
    const staging = join(root, `.pikku-add-${id}-${Date.now()}`)
    await mkdir(staging, { recursive: true })
    const tmp = join(tmpdir(), `pikku-add-${Date.now()}.tgz`)
    await writeFile(tmp, artifact)
    try {
      execFileSync('tar', ['-xzf', tmp, '-C', staging, '--strip-components=1'])
      await rm(tmp, { force: true })

      // 4. read the package name and move into <root>/<name>
      const pkg = JSON.parse(
        await readFile(join(staging, 'package.json'), 'utf8')
      ) as { name?: string }
      if (!pkg.name)
        throw new Error('artifact package.json is missing a "name" field')

      const target = join(root, ...pkg.name.split('/'))
      await rm(target, { recursive: true, force: true })
      await mkdir(dirname(target), { recursive: true })
      await rename(staging, target)

      console.log(`[fabric] installed ${pkg.name} → ${target}`)
      return { id, path: target }
    } finally {
      await rm(staging, { recursive: true, force: true })
      await rm(tmp, { force: true })
    }
  },
})
