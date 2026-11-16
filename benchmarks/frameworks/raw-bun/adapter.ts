import { mkdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Adapter } from '../types.js'

const here = dirname(fileURLToPath(import.meta.url))

const adapter: Adapter = {
  name: 'raw-bun',
  runtime: 'bun',
  validator: '@cfworker/json-schema (same schema as Pikku)',
  variants: [{ id: 'raw-bun', env: {} }],
  async prepare() {
    const dist = join(here, 'dist')
    mkdirSync(dist, { recursive: true })
    const binary = join(dist, 'server')
    const res = spawnSync(
      'bun',
      ['build', '--compile', `--outfile=${binary}`, join(here, 'app.ts')],
      { encoding: 'utf-8' }
    )
    if (res.status !== 0) throw new Error(res.stdout + res.stderr)
    return {
      command: [binary],
      cwd: dist,
      sizeBytes: statSync(binary).size,
      profileCommand: ['bun', join(here, 'app.ts')],
    }
  },
}
export default adapter
