/**
 * How `pikku all` reads the role markers of a workspace, for the cases that
 * must be refused. Each case writes a small project under `.markers/` (git
 * ignored, removed afterwards) and runs `pikku all` in it; the loader refuses
 * before any code is read, so no case needs a real build.
 *
 *   1. two packages marked `"main": true` are refused, naming both
 *   2. a workspace package config with neither marker is refused
 *   3. a package marked both main and addon is refused
 *   4. an addon with no namespace is refused
 *   5. `base` and `addons` in the root config are refused with a pointer to the markers
 *
 * The workspace that does build, a main package and two addons found by their
 * markers, is `pku368.mjs`, and the one main package and addon is `run.mjs`.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PIKKU =
  process.env.PIKKU_BIN ??
  join(resolve(here, '../..'), 'packages/cli/dist/bin/pikku.js')
const base = join(here, '.markers')
const fail = (message) => {
  console.error(`✗ ${message}`)
  process.exit(1)
}

const write = (file, content) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(content, null, 2))
}

/** A project whose workspace holds `packages`, each `{ config }` becoming its pikku.config.json. */
const project = (name, packages, rootConfig = {}) => {
  const root = join(base, name)
  write(join(root, 'package.json'), { name, workspaces: ['packages/*'] })
  write(join(root, 'pikku.config.json'), {
    tsconfig: './tsconfig.json',
    backends: { api: { filter: {} } },
    ...rootConfig,
  })
  for (const [dir, config] of Object.entries(packages)) {
    write(join(root, 'packages', dir, 'package.json'), { name: `@m/${dir}` })
    write(join(root, 'packages', dir, 'pikku.config.json'), config)
  }
  return root
}

const addon = (namespace) => ({
  addon: { displayName: namespace },
  ...(namespace ? { namespace } : {}),
})

const refused = (root, pattern, what) => {
  const run = spawnSync('node', [PIKKU, 'all'], {
    cwd: root,
    encoding: 'utf8',
  })
  const output = run.stdout + run.stderr
  if (run.status === 0) fail(`${what}: pikku all passed`)
  if (!pattern.test(output)) {
    console.error(output)
    fail(`${what}: refused, but the message did not match ${pattern}`)
  }
  console.log(`✓ ${what}`)
}

try {
  rmSync(base, { recursive: true, force: true })

  refused(
    project('two-mains', {
      one: { main: true },
      two: { main: true },
      tools: addon('tools'),
    }),
    /packages\/one and packages\/two are both marked "main": true/,
    'two main packages are refused, naming both'
  )

  refused(
    project('no-markers', { one: {}, two: { tsconfig: './tsconfig.json' } }),
    /packages\/one\/pikku\.config\.json is a workspace package with no role marker/,
    'a workspace of package configs with no markers is refused'
  )

  refused(
    project('both', { one: { main: true, ...addon('one') } }),
    /both "main" and "addon"/,
    'a package marked both main and addon is refused'
  )

  refused(
    project('no-namespace', { one: { main: true }, tools: addon() }),
    /packages\/tools\/pikku\.config\.json is an addon with no namespace/,
    'an addon with no namespace is refused'
  )

  refused(
    project('base-key', { one: { main: true } }, { base: 'packages/one' }),
    /base in .*is no longer a key.*"main": true/,
    'the base key is refused, pointing at the main marker'
  )

  refused(
    project('addons-key', { tools: addon('tools') }, { addons: ['packages/tools'] }),
    /addons in .*is no longer a key.*"addon"/,
    'the addons key is refused, pointing at the addon marker'
  )
} finally {
  rmSync(base, { recursive: true, force: true })
}
