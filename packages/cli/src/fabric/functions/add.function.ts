import { z } from 'zod'
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises'
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

const DEFAULT_ADDON_DIR = 'src/addons'

/** Walk up from cwd to find pikku.config.json and read its addons.addonDir. */
async function resolveAddonDir(): Promise<string> {
  let dir = process.cwd()
  while (true) {
    const candidate = join(dir, 'pikku.config.json')
    if (existsSync(candidate)) {
      const cfg = JSON.parse(await readFile(candidate, 'utf8')) as {
        rootDir?: string
        addons?: { addonDir?: string }
      }
      const addonDir = cfg.addons?.addonDir ?? DEFAULT_ADDON_DIR
      return isAbsolute(addonDir) ? addonDir : join(dir, addonDir)
    }
    const parent = dirname(dir)
    if (parent === dir) return join(process.cwd(), DEFAULT_ADDON_DIR)
    dir = parent
  }
}

/**
 * Install a community-registry package into the project. Resolves a presigned
 * download URL (public — no auth needed), fetches the artifact, and extracts it
 * shadcn-style into `<addonDir>/<id>/` so the source is copied into the
 * codebase. `addonDir` comes from pikku.config.json `addons.addonDir`
 * (default `src/addons`), or `--dir`.
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

    // 3. extract into <addonDir>/<id> (replace any prior copy)
    const baseDir = dir
      ? isAbsolute(dir)
        ? dir
        : join(process.cwd(), dir)
      : await resolveAddonDir()
    const target = join(baseDir, id)
    await rm(target, { recursive: true, force: true })
    await mkdir(target, { recursive: true })

    const tmp = join(tmpdir(), `pikku-add-${Date.now()}.tgz`)
    await writeFile(tmp, artifact)
    execFileSync('tar', ['-xzf', tmp, '-C', target])
    await rm(tmp, { force: true })

    console.log(`[fabric] installed ${id} → ${target}`)
    return { id, path: target }
  },
})
