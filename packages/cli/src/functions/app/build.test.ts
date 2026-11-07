import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAppBuild } from './build.js'

let root: string
let lines: string[]

const logger = {
  info: (line: string) => lines.push(line),
  error: (line: string) => lines.push(line),
  warn: () => {},
  debug: () => {},
} as never

const app = (
  name: string,
  script: string | undefined,
  extra: Record<string, unknown> = {}
) => {
  const cwd = join(root, name)
  mkdirSync(cwd)
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({ name, scripts: script ? { build: script } : {} })
  )
  return { [name]: { cwd, dist: join(cwd, 'dist'), ...extra } }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-app-build-'))
  lines = []
  process.exitCode = 0
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  process.exitCode = 0
})

describe('pikku app build', () => {
  test("runs each frontend's own script in its directory", async () => {
    const { apps } = await runAppBuild(
      {
        logger,
        frontends: {
          ...app('one', 'touch built'),
          ...app('two', 'touch built'),
        },
      },
      {}
    )
    assert.deepEqual(apps.map((a) => [a.name, a.ok]).sort(), [
      ['one', true],
      ['two', true],
    ])
    assert.ok(existsSync(join(root, 'one', 'built')))
    assert.ok(existsSync(join(root, 'two', 'built')))
    assert.ok(!process.exitCode)
  })

  test('runs side by side', async () => {
    // Each waits for the other's file, so run one after the other they hang.
    const wait = (file: string) =>
      `touch started && for i in 1 2 3 4 5 6 7 8 9 10; do [ -f ../${file}/started ] && exit 0; sleep 0.2; done; exit 1`
    const { apps } = await runAppBuild(
      {
        logger,
        frontends: { ...app('one', wait('two')), ...app('two', wait('one')) },
      },
      {}
    )
    assert.ok(
      apps.every((a) => a.ok),
      lines.join('\n')
    )
  })

  test('skips a frontend with deploy: false', async () => {
    const { apps } = await runAppBuild(
      {
        logger,
        frontends: {
          ...app('kept', 'true'),
          ...app('skipped', 'touch built', { deploy: false }),
        },
      },
      {}
    )
    assert.deepEqual(
      apps.map((a) => a.name),
      ['kept']
    )
    assert.ok(!existsSync(join(root, 'skipped', 'built')))
  })

  test('a failed app is non-zero, attributed, and the others finish', async () => {
    const { apps } = await runAppBuild(
      {
        logger,
        frontends: {
          ...app('bad', 'echo nope && exit 3'),
          ...app('good', 'sleep 0.2 && touch built'),
        },
      },
      {}
    )
    assert.equal(process.exitCode, 1)
    assert.equal(apps.find((a) => a.name === 'bad')?.ok, false)
    assert.ok(lines.includes('[bad] nope'), lines.join('\n'))
    assert.ok(lines.some((l) => /^\[bad\] build failed: exit 3/.test(l)))
    assert.ok(existsSync(join(root, 'good', 'built')))
  })

  test('a frontend with no build script fails', async () => {
    const { apps } = await runAppBuild(
      { logger, frontends: app('bare', undefined) },
      {}
    )
    assert.equal(apps[0]?.ok, false)
    assert.equal(process.exitCode, 1)
  })

  test('--only-served and --skip-served split the frontends', async () => {
    const frontends = {
      ...app('served', 'true', {
        serve: { urlPrefix: '/', spaFallback: true },
      }),
      ...app('other', 'true'),
    }
    const only = await runAppBuild({ logger, frontends }, { onlyServed: true })
    assert.deepEqual(
      only.apps.map((a) => a.name),
      ['served']
    )
    const rest = await runAppBuild({ logger, frontends }, { skipServed: true })
    assert.deepEqual(
      rest.apps.map((a) => a.name),
      ['other']
    )
  })
})
