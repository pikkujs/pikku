/**
 * The negative half of the base-and-addons proof: the base does not provide a
 * service the addon takes from its project, so `pikku all` at the root fails
 * with PKU368 naming the addon function and the service.
 *
 * A separate script because the failing step is retried before it gives up
 * (about 40s), which `run.mjs` should not pay on every run. It works on a copy
 * of the fixture under `.negative/`, and removes it afterwards.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PIKKU = join(resolve(here, '../..'), 'packages/cli/dist/bin/pikku.js')
const copy = join(here, '.negative')
const fail = (message) => {
  console.error(`✗ ${message}`)
  process.exit(1)
}

const pikku = (cwd) =>
  spawnSync('node', [PIKKU, 'all'], { cwd, encoding: 'utf8' })

try {
  rmSync(copy, { recursive: true, force: true })
  const skip = (src) => !/\/(\.pikku|node_modules)(\/|$)/.test(src)
  for (const file of ['pikku.config.json', 'tsconfig.json']) {
    cpSync(join(here, file), join(copy, file))
  }
  cpSync(join(here, 'packages'), join(copy, 'packages'), {
    recursive: true,
    filter: skip,
  })

  // The addon is wired by package name, so its generated metadata is the real
  // package's: build it first when run.mjs has not.
  const meta = join(
    here,
    'packages/tools/.pikku/addon/function/pikku-functions-meta.gen.json'
  )
  if (!existsSync(meta)) {
    const built = pikku(join(here, 'packages/tools'))
    if (built.status !== 0) {
      console.error(built.stdout + built.stderr)
      fail('pikku all failed in the addon')
    }
  }

  // The base stops providing `stamper`.
  const app = join(copy, 'packages/app')
  const services = join(app, 'src/services.ts')
  writeFileSync(
    services,
    readFileSync(services, 'utf8').replace(/^.*stamper:.*\n/m, '')
  )
  const types = join(app, 'types/application-types.d.ts')
  writeFileSync(
    types,
    readFileSync(types, 'utf8').replace(/^.*stamper:.*\n/m, '')
  )

  const run = pikku(copy)
  const output = run.stdout + run.stderr
  if (run.status === 0)
    fail('pikku all passed although the base lacks `stamper`')
  if (!/PKU368/.test(output)) {
    console.error(output)
    fail('pikku all failed, but not with PKU368')
  }
  if (!/'tools:stamped'.*'stamper'/.test(output)) {
    console.error(output)
    fail('PKU368 does not name tools:stamped and stamper')
  }
  console.log('✓ a service the base does not provide is refused (PKU368)')
} finally {
  rmSync(copy, { recursive: true, force: true })
}
