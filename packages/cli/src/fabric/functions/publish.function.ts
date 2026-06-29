import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { renderAddonVerify } from './addon-verify.function.js'

export const FabricPublishInput = z.object({
  dir: z.string().optional(),
  apiUrl: z.string().optional(),
})

export const FabricPublishOutput = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  publisher: z.string().nullable(),
})

/**
 * Publish a package to the Fabric community registry. Packs the directory into
 * a gzipped tar, requests a short-lived presigned upload URL, PUTs the artifact
 * to R2, then finalizes the publish so the catalogue indexes it. Authenticated
 * as the logged-in user (the package is attributed to their org or person).
 *
 * Generating the package contents (`.pikku/` meta etc.) is a separate step;
 * this command only packages + uploads what's already in the directory.
 */
export const FabricPublish = pikkuSessionlessFunc({
  description: 'Publish a package directory to the Fabric community registry.',
  input: FabricPublishInput,
  output: FabricPublishOutput,
  func: async (_services, { dir, apiUrl: apiUrlOverride }, { rpc }) => {
    const verification = await rpc.invoke('FabricAddonVerify', { dir })
    renderAddonVerify(undefined, verification)
    if (!verification.ok) {
      throw new Error(
        'Addon verification failed — fix the errors above before publishing.'
      )
    }

    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')

    const packageDir = dir ?? process.cwd()
    const pkgPath = join(packageDir, 'package.json')
    if (!existsSync(pkgPath))
      throw new Error(`No package.json found in ${packageDir}`)
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
      name?: string
      version?: string
    }
    if (!pkg.name || !pkg.version)
      throw new Error('package.json must have a name and version')

    // Pack via `npm pack` so the artifact honours the package's `files` field
    // (ship src/.pikku/types, not build/VCS noise) and matches the layout a
    // normal install produces. npm nests contents under `package/`; the
    // registry ingestion and `pikku fabric add` both handle that prefix.
    const packDir = join(tmpdir(), `pikku-publish-${Date.now()}`)
    mkdirSync(packDir, { recursive: true })
    const packOut = execFileSync(
      'npm',
      ['pack', '--json', '--pack-destination', packDir],
      { cwd: packageDir, encoding: 'utf8' }
    )
    const tgzName = JSON.parse(packOut)[0].filename
    const artifact = readFileSync(join(packDir, tgzName))

    const headers = {
      authorization: `Bearer ${ctx.token}`,
      'content-type': 'application/json',
    }
    const post = async (path: string, body: unknown) => {
      const r = await fetch(`${ctx.apiUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!r.ok)
        throw new Error(`POST ${path} → ${r.status}: ${await r.text()}`)
      return r.json() as Promise<any>
    }

    // 1. presigned upload URL (short-lived)
    const { uploadUrl, artifactKey } = await post(
      '/registry/addons/publish-url',
      { packageName: pkg.name, version: pkg.version }
    )

    // 2. PUT the artifact to the exact signed URL (no extra headers — the URL
    //    is signed over host only; mismatched headers break the signature).
    const put = await fetch(uploadUrl, { method: 'PUT', body: artifact })
    if (!put.ok)
      throw new Error(`upload failed → ${put.status}: ${await put.text()}`)

    // 3. finalize — server reads the artifact back, extracts meta, indexes it
    const entry = await post('/registry/addons/publish', { artifactKey })

    const publisher: string | null = entry.publisher?.name ?? null
    console.log(
      `[fabric] published ${entry.name}@${entry.version} (id=${entry.id})` +
        (publisher ? ` as ${publisher}` : '')
    )

    return {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      publisher,
    }
  },
})
