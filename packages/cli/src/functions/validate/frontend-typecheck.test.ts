import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseTscErrors,
  resolveTypeCheckCommand,
  typeCheckFrontends,
} from './frontend-typecheck.js'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'pikku-typecheck-'))
}

async function writeJson(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

/**
 * A stand-in package manager, so a test can drive the runner end-to-end without
 * depending on which one happens to be installed. `packageManager` is read as
 * `name@version`, and an absolute path has no `@` — so it resolves to itself.
 */
async function fakePackageManager(dir: string, body: string): Promise<string> {
  const path = join(dir, 'fake-pm')
  await writeFile(path, `#!/bin/sh\n${body}\n`, 'utf8')
  await chmod(path, 0o755)
  return path
}

describe('parseTscErrors', () => {
  test('keeps tsc diagnostics and drops the runner chatter', () => {
    const errors = parseTscErrors(
      [
        'yarn run v1.22.19',
        '$ tsc --noEmit',
        "src/routes/index.tsx(12,7): error TS2353: Object literal may only specify known properties, and 'component' does not exist.",
        'src/lib/env.ts(4,1): error TS2304: Cannot find name "process".',
        'error Command failed with exit code 2.',
      ].join('\n')
    )
    assert.deepEqual(errors, [
      "src/routes/index.tsx(12,7): error TS2353: Object literal may only specify known properties, and 'component' does not exist.",
      'src/lib/env.ts(4,1): error TS2304: Cannot find name "process".',
    ])
  })

  test('falls back to the output tail when nothing parses', () => {
    const errors = parseTscErrors(
      'error TS5083: Cannot read file tsconfig.json.\n'
    )
    assert.deepEqual(errors, ['error TS5083: Cannot read file tsconfig.json.'])
  })

  test('a silent non-zero exit still reports a failure', () => {
    // An empty list here reads as "compiled fine" and lets the deploy through.
    assert.deepEqual(parseTscErrors(''), [
      'type-check exited non-zero without producing any output',
    ])
    assert.deepEqual(parseTscErrors('   \n\n'), [
      'type-check exited non-zero without producing any output',
    ])
  })
})

describe('resolveTypeCheckCommand', () => {
  test('runs the frontend own tsc script through the declared package manager', async () => {
    const tmp = await makeTmp()
    try {
      const app = join(tmp, 'apps', 'app')
      await mkdir(app, { recursive: true })
      await writeJson(join(tmp, 'package.json'), {
        packageManager: 'yarn@4.1.0',
      })
      await writeJson(join(app, 'package.json'), { scripts: { tsc: 'tsc' } })

      assert.deepEqual(await resolveTypeCheckCommand(tmp, app), {
        command: 'yarn',
        args: ['run', 'tsc'],
      })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('falls back to tsc --noEmit when the frontend has no tsc script', async () => {
    const tmp = await makeTmp()
    try {
      const app = join(tmp, 'apps', 'app')
      await mkdir(app, { recursive: true })
      await writeFile(join(tmp, 'pnpm-lock.yaml'), '', 'utf8')
      await writeJson(join(app, 'package.json'), { scripts: { build: 'vite' } })

      assert.deepEqual(await resolveTypeCheckCommand(tmp, app), {
        command: 'pnpm',
        args: ['tsc', '--noEmit'],
      })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('the npm fallback goes through npx', async () => {
    const tmp = await makeTmp()
    try {
      const app = join(tmp, 'apps', 'app')
      await mkdir(app, { recursive: true })

      assert.deepEqual(await resolveTypeCheckCommand(tmp, app), {
        command: 'npx',
        args: ['tsc', '--noEmit'],
      })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('typeCheckFrontends', () => {
  test('skips a frontend with no tsconfig.json, and reports the command', async () => {
    const tmp = await makeTmp()
    try {
      const app = join(tmp, 'apps', 'app')
      await mkdir(app, { recursive: true })
      await writeFile(join(tmp, 'yarn.lock'), '', 'utf8')

      const [result] = await typeCheckFrontends(tmp, [
        { name: 'app', dir: app },
      ])
      assert.equal(result?.skipped, 'no tsconfig.json')
      assert.equal(result?.command, 'yarn tsc --noEmit')
      assert.deepEqual(result?.errors, [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('skips — rather than passes — when the runner is not on PATH', async () => {
    const tmp = await makeTmp()
    try {
      const app = join(tmp, 'apps', 'app')
      await mkdir(app, { recursive: true })
      await writeJson(join(app, 'tsconfig.json'), {})
      await writeJson(join(app, 'package.json'), {
        packageManager: 'pikku-no-such-package-manager@1.0.0',
        scripts: { tsc: 'tsc' },
      })

      const [result] = await typeCheckFrontends(tmp, [
        { name: 'app', dir: app },
      ])
      assert.match(result?.skipped ?? '', /not found on PATH/)
      assert.deepEqual(result?.errors, [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('reports the diagnostics of a failing type-check', async (t) => {
    if (process.platform === 'win32') {
      t.skip('the stub package manager is a shell script')
      return
    }
    const tmp = await makeTmp()
    try {
      const app = join(tmp, 'apps', 'app')
      await mkdir(app, { recursive: true })
      await writeJson(join(app, 'tsconfig.json'), {})
      const pm = await fakePackageManager(
        tmp,
        [
          'echo "$ tsc --noEmit"',
          'echo "src/app.tsx(3,5): error TS2322: Type X is not assignable to type Y."',
          'exit 2',
        ].join('\n')
      )
      await writeJson(join(app, 'package.json'), {
        packageManager: pm,
        scripts: { tsc: 'tsc' },
      })

      const [result] = await typeCheckFrontends(tmp, [
        { name: 'app', dir: app },
      ])
      assert.equal(result?.skipped, undefined)
      assert.deepEqual(result?.errors, [
        'src/app.tsx(3,5): error TS2322: Type X is not assignable to type Y.',
      ])
      assert.equal(result?.command, `${pm} run tsc`)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a clean type-check produces no errors', async (t) => {
    if (process.platform === 'win32') {
      t.skip('the stub package manager is a shell script')
      return
    }
    const tmp = await makeTmp()
    try {
      const app = join(tmp, 'apps', 'app')
      await mkdir(app, { recursive: true })
      await writeJson(join(app, 'tsconfig.json'), {})
      const pm = await fakePackageManager(tmp, 'exit 0')
      await writeJson(join(app, 'package.json'), {
        packageManager: pm,
        scripts: { tsc: 'tsc' },
      })

      const [result] = await typeCheckFrontends(tmp, [
        { name: 'app', dir: app },
      ])
      assert.deepEqual(result?.errors, [])
      assert.equal(result?.skipped, undefined)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a non-zero exit with no output is still a failure', async (t) => {
    if (process.platform === 'win32') {
      t.skip('the stub package manager is a shell script')
      return
    }
    const tmp = await makeTmp()
    try {
      const app = join(tmp, 'apps', 'app')
      await mkdir(app, { recursive: true })
      await writeJson(join(app, 'tsconfig.json'), {})
      const pm = await fakePackageManager(tmp, 'exit 1')
      await writeJson(join(app, 'package.json'), {
        packageManager: pm,
        scripts: { tsc: 'tsc' },
      })

      const [result] = await typeCheckFrontends(tmp, [
        { name: 'app', dir: app },
      ])
      assert.deepEqual(result?.errors, [
        'type-check exited non-zero without producing any output',
      ])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
