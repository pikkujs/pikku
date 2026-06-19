import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'

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
  func: async (_services, { dir, apiUrl: apiUrlOverride }) => {
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

    // Pack the directory into a gzipped tar (artifact). Excludes are the usual
    // build/VCS noise; everything else ships so consumers can copy it in.
    const artifactPath = join(tmpdir(), `pikku-publish-${Date.now()}.tgz`)
    execFileSync('tar', [
      '-czf',
      artifactPath,
      '-C',
      packageDir,
      '--exclude=node_modules',
      '--exclude=.git',
      '--exclude=dist',
      '.',
    ])
    const artifact = readFileSync(artifactPath)

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
      if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${await r.text()}`)
      return r.json() as Promise<any>
    }

    // 1. presigned upload URL (short-lived)
    const { uploadUrl, artifactKey } = await post(
      '/registry/packages/publish-url',
      { packageName: pkg.name, version: pkg.version }
    )

    // 2. PUT the artifact to the exact signed URL (no extra headers — the URL
    //    is signed over host only; mismatched headers break the signature).
    const put = await fetch(uploadUrl, { method: 'PUT', body: artifact })
    if (!put.ok)
      throw new Error(`upload failed → ${put.status}: ${await put.text()}`)

    // 3. finalize — server reads the artifact back, extracts meta, indexes it
    const entry = await post('/registry/packages/publish', { artifactKey })

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
