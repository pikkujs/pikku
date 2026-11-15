import { statSync, mkdirSync, copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Adapter } from '../types.js'
import { generateRoutes } from './gen-routes.js'

const here = dirname(fileURLToPath(import.meta.url))
const pikkuBin = resolve(here, '../../../packages/cli/dist/bin/pikku.js')
const unit = join(here, '.deploy', 'standalone', 'bench-frameworks-pikku')

const run = (cmd: string, args: string[], cwd: string) => {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf-8' })
  if (res.status !== 0)
    throw new Error(`${cmd} ${args.join(' ')}\n${res.stdout}${res.stderr}`)
}

/** Pikku standalone: `pikku all`, `pikku deploy plan --provider standalone`, `bun build --compile` of the unit bundle. One binary per route count. */
const adapter: Adapter = {
  name: 'pikku',
  runtime: 'bun',
  validator: '@cfworker/json-schema (CFWorkerSchemaService)',
  variants: [
    { id: 'pikku-LE', env: {} },
    { id: 'pikku-L0', env: { PIKKU_TELEMETRY: '0' } },
    {
      id: 'pikku-L3',
      sink: true,
      env: { PIKKU_OTLP_ENDPOINT: '{SINK}/v1/otlp' },
    },
  ],
  async prepare(routes) {
    generateRoutes(routes)
    run('node', [pikkuBin, 'all'], here)
    run(
      'node',
      [
        pikkuBin,
        'deploy',
        'plan',
        '--provider',
        'standalone',
        '--result-file',
        '.deploy/standalone/plan-result.json',
      ],
      here
    )
    const dist = join(here, 'dist', `n${routes}`)
    mkdirSync(dist, { recursive: true })
    const binary = join(dist, 'server')
    run(
      'bun',
      ['build', '--compile', `--outfile=${binary}`, join(unit, 'bundle.js')],
      unit
    )
    const profileBundle = join(dist, 'bundle.js')
    copyFileSync(join(unit, 'bundle.js'), profileBundle)
    return {
      command: [binary],
      cwd: dist,
      sizeBytes: statSync(binary).size,
      profileCommand: ['bun', profileBundle],
    }
  },
}
export default adapter
