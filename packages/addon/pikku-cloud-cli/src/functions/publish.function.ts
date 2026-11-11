import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { CloudPreconditionError } from '@pikku/cli/addon-support'

export const CloudPublishInput = z.object({
  dir: z.string().optional(),
  apiUrl: z.string().optional(),
})

export const CloudPublishOutput = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  publisher: z.string().nullable(),
})

/**
 * Publish a package to the Pikku Studio Cloud community registry. Packs the directory into
 * a gzipped tar, requests a short-lived presigned upload URL, PUTs the artifact
 * to R2, then finalizes the publish so the catalogue indexes it. Authenticated
 * as the logged-in user (the package is attributed to their org or person).
 *
 * Generating the package contents (`.pikku/` meta etc.) is a separate step;
 * this command only packages + uploads what's already in the directory.
 */
export const CloudPublish = pikkuSessionlessFunc({
  description:
    'Publish a package directory to the Pikku Studio Cloud community registry.',
  input: CloudPublishInput,
  output: CloudPublishOutput,
  func: async (_services, { dir, apiUrl: apiUrlOverride }, { rpc, cli }) => {
    const verification = await rpc.invoke('CloudAddonVerify', { dir })
    await cli?.channel.send(verification)
    if (!verification.ok) {
      throw new CloudPreconditionError(
        'Addon verification failed — fix the errors above before publishing.'
      )
    }

    const ctx = await resolveApiContext({
      apiUrlOverride,
      resolveProject: false,
    })
    if (!ctx.token)
      throw new CloudPreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )

    const packageDir = dir ?? process.cwd()
    const pkgPath = join(packageDir, 'package.json')
    if (!existsSync(pkgPath))
      throw new CloudPreconditionError(`No package.json found in ${packageDir}`)
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
      name?: string
      version?: string
    }
    if (!pkg.name || !pkg.version)
      throw new CloudPreconditionError(
        'package.json must have a name and version'
      )

    // Pack via `npm pack` so the artifact honours the package's `files` field
    // (ship src/.pikku/types, not build/VCS noise) and matches the layout a
    // normal install produces. npm nests contents under `package/`; the
    // registry ingestion and `pikku cloud add` both handle that prefix.
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
        throw new CloudPreconditionError(
          `POST ${path} → ${r.status}: ${await r.text()}`
        )
      return r.json() as Promise<any>
    }

    // 1. presigned upload URL (short-lived)
    const { uploadUrl, uploadHeaders, artifactKey } = await post(
      '/registry/addons/publish-url',
      { packageName: pkg.name, version: pkg.version, size: artifact.byteLength }
    )

    // 2. PUT the artifact to the exact signed URL with only the headers it was
    //    signed over; any other header breaks the signature.
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: artifact,
    })
    if (!put.ok)
      throw new CloudPreconditionError(
        `upload failed → ${put.status}: ${await put.text()}`
      )

    // 3. finalize — server reads the artifact back, extracts meta, indexes it
    const entry = await post('/registry/addons/publish', { artifactKey })

    const publisher: string | null = entry.publisher?.name ?? null
    console.log(
      `[cloud] published ${entry.name}@${entry.version} (id=${entry.id})` +
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
