import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

const EMBEDDED_RUNTIME = 'PIKKU_EMBEDDED_STUDIO_RUNTIME'

const shims = (self: string, dir: string): Record<string, string> => {
  const bun = `BUN_BE_BUN=1 exec "${self}"`
  return {
    bun: `${bun} "$@"`,
    node: `${bun} "$@"`,
    npx: `while [ "$1" = "--no" ] || [ "$1" = "--yes" ] || [ "$1" = "-y" ]; do shift; done\n${bun} x "$@"`,
    pi: `${bun} "${join(dir, 'pi', 'dist', 'bundle', 'cli.js')}" "$@"`,
  }
}

export async function installEmbeddedRuntime(home: string): Promise<string | null> {
  const archive = process.env[EMBEDDED_RUNTIME]
  if (!archive) return null
  const bytes = await readFile(archive)
  const dir = join(home, 'runtime', createHash('sha256').update(bytes).digest('hex').slice(0, 16))
  if (!existsSync(dir)) {
    const staging = `${dir}.${process.pid}`
    await rm(staging, { recursive: true, force: true })
    await mkdir(staging, { recursive: true })
    await new Bun.Archive(bytes).extract(staging)
    await rename(staging, dir).catch(async (error) => {
      if (!existsSync(dir)) throw error
      await rm(staging, { recursive: true, force: true })
    })
  }
  const bin = join(dir, 'bin')
  await mkdir(bin, { recursive: true })
  for (const [name, body] of Object.entries(shims(process.execPath, dir))) {
    await writeFile(join(bin, name), `#!/bin/sh\n${body}\n`)
    await chmod(join(bin, name), 0o755)
  }
  process.env.PATH = [bin, process.env.PATH].filter(Boolean).join(delimiter)
  process.env.BUN_BE_BUN = '1'
  process.env.PIKKU_PI_ROOT = join(dir, 'pi')
  process.env.PIKKU_BUILDER_EXTENSIONS = join(dir, 'extensions')
  return dir
}
