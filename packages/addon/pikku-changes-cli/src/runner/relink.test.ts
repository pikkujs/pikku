import assert from 'node:assert'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { REPO_ROOT } from '../lib/test-support.js'
import { relinkPikku } from './relink.js'

const made: string[] = []
const scratch = (prefix: string) => {
  mkdirSync(join(REPO_ROOT, '.tmp'), { recursive: true })
  const dir = realpathSync(mkdtempSync(join(REPO_ROOT, '.tmp', prefix)))
  made.push(dir)
  return dir
}
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

const pkg = (dir: string, json: Record<string, unknown>) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(json))
}

test("the runner's relinkPikku points every installed copy of what the local CLI needs at the local checkout, dedupes kysely, and makes .bin/pikku the local CLI", () => {
  const root = scratch('pikku-checkout-')
  pkg(join(root, 'packages', 'cli'), {
    name: '@pikku/cli',
    dependencies: { '@pikku/core': '*' },
  })
  pkg(join(root, 'packages', 'core'), { name: '@pikku/core' })
  pkg(join(root, 'packages', 'react'), { name: '@pikku/react' })
  pkg(join(root, 'packages', 'services', 'kysely'), { name: '@pikku/kysely' })
  pkg(join(root, 'packages', 'services', 'kysely', 'node_modules', 'kysely'), {
    name: 'kysely',
    version: 'local',
  })
  mkdirSync(join(root, 'packages', 'cli', 'dist', 'bin'), { recursive: true })
  const bin = join(root, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
  writeFileSync(bin, '')
  const project = scratch('pikku-wt-')
  const nm = join(project, 'node_modules')
  pkg(join(nm, '@pikku', 'cli'), { name: '@pikku/cli', version: 'published' })
  pkg(join(nm, '@pikku', 'core'), { name: '@pikku/core', version: 'published' })
  pkg(join(nm, '@pikku', 'react'), {
    name: '@pikku/react',
    version: 'published',
  })
  pkg(join(nm, 'some-lib', 'node_modules', '@pikku', 'core'), {
    name: '@pikku/core',
    version: 'nested',
  })
  pkg(join(nm, 'kysely'), { name: 'kysely', version: 'project' })
  pkg(join(project, 'packages', 'functions', 'node_modules', 'kysely'), {
    name: 'kysely',
    version: 'workspace',
  })
  mkdirSync(join(nm, '.bin'))
  writeFileSync(join(nm, '.bin', 'pikku'), 'published')
  relinkPikku(project, { bin, checkout: root })
  const target = (path: string) =>
    lstatSync(path).isSymbolicLink() ? readlinkSync(path) : 'not a link'
  assert.equal(target(join(nm, '@pikku', 'cli')), join(root, 'packages', 'cli'))
  assert.equal(
    target(join(nm, '@pikku', 'core')),
    join(root, 'packages', 'core')
  )
  assert.equal(
    target(join(nm, 'some-lib', 'node_modules', '@pikku', 'core')),
    join(root, 'packages', 'core')
  )
  assert.equal(
    target(join(nm, '@pikku', 'react')),
    'not a link',
    'a package the CLI does not need is left as installed'
  )
  assert.equal(
    target(join(nm, 'kysely')),
    join(root, 'packages', 'services', 'kysely', 'node_modules', 'kysely')
  )
  assert.equal(
    target(join(project, 'packages', 'functions', 'node_modules', 'kysely')),
    join(root, 'packages', 'services', 'kysely', 'node_modules', 'kysely')
  )
  assert.equal(target(join(nm, '.bin', 'pikku')), bin)
  assert.ok(existsSync(join(nm, '@pikku', 'core', 'package.json')))
})
