import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pikkuReleaseInit, pikkuReleasePrepare } from './release.js'

let root: string
let app: string
let remote: string

const sh = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()

const services = () => ({
  config: { rootDir: app, outDir: '.pikku' },
  logger: { warn: () => {}, info: () => {}, debug: () => {} },
})

const run = (fn: unknown, input: unknown = {}) =>
  (fn as { func: Function }).func(services(), input)

const commitOnStaging = (message: string) => {
  writeFileSync(join(app, 'work.txt'), `${message}\n`, { flag: 'a' })
  sh(app, 'add', 'work.txt')
  sh(app, 'commit', '-q', '-m', message)
  sh(app, 'push', '-q', 'origin', 'HEAD:refs/heads/staging')
}

const checkoutStaging = () => {
  sh(app, 'fetch', '-q', 'origin')
  sh(app, 'checkout', '-q', '--detach', 'origin/staging')
}

const ship = async (input: unknown = {}) => {
  const prepared = await run(pikkuReleasePrepare, input)
  sh(app, 'add', '--', ...prepared.files)
  sh(app, 'commit', '-q', '-m', `release: v${prepared.version}`)
  sh(app, 'push', '-q', 'origin', 'HEAD:refs/heads/staging', 'HEAD:refs/heads/main')
  checkoutStaging()
  return prepared
}

const version = () =>
  JSON.parse(readFileSync(join(app, 'package.json'), 'utf-8')).version

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'pikku-release-'))
  remote = join(root, 'remote.git')
  app = join(root, 'app')
  sh(root, 'init', '-q', '--bare', remote)
  sh(root, 'init', '-q', '-b', 'staging', app)
  sh(app, 'config', 'user.email', 'dev@example.com')
  sh(app, 'config', 'user.name', 'dev')
  sh(app, 'remote', 'add', 'origin', remote)
  writeFileSync(
    join(app, 'package.json'),
    '{\n  "name": "app",\n  "version": "0.1.0"\n}\n'
  )
  writeFileSync(join(app, '.gitignore'), '.pikku\n')
  await run(pikkuReleaseInit)
  sh(app, 'add', '.')
  sh(app, 'commit', '-q', '-m', 'init')
  sh(app, 'push', '-q', 'origin', 'HEAD:refs/heads/staging')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('pikku release', () => {
  test('prepare writes the release and commits and pushes nothing', async () => {
    const head = sh(app, 'rev-parse', 'HEAD')
    const prepared = await run(pikkuReleasePrepare)
    assert.equal(prepared.status, 'prepared')
    assert.equal(prepared.version, '0.1.1')
    assert.equal(prepared.trunkSha, head)
    assert.deepEqual(prepared.files, [
      'package.json',
      'CHANGELOG.md',
      'surface.pikku.json',
    ])
    assert.equal(version(), '0.1.1')
    assert.match(readFileSync(join(app, 'CHANGELOG.md'), 'utf-8'), /## 0\.1\.1 /)
    assert.equal(sh(app, 'rev-parse', 'HEAD'), head)
    assert.equal(sh(app, 'ls-remote', 'origin', 'refs/heads/main'), '')
    assert.equal(sh(app, 'ls-remote', 'origin', 'refs/heads/release/next'), '')
  })

  test('reports nothing to release once trunk is live', async () => {
    await ship()
    assert.equal((await run(pikkuReleasePrepare)).status, 'nothing')
  })

  test('a Release trailer does not change the bump', async () => {
    await ship()
    commitOnStaging('new report\n\nRelease: major')
    const prepared = await run(pikkuReleasePrepare)
    assert.equal(prepared.previousVersion, '0.1.1')
    assert.equal(prepared.version, '0.1.2')
  })

  test('prepare refuses while production has commits trunk lacks', async () => {
    await ship()
    sh(app, 'checkout', '-q', '--detach', 'origin/main')
    writeFileSync(join(app, 'hotfix.txt'), 'fix\n')
    sh(app, 'add', 'hotfix.txt')
    sh(app, 'commit', '-q', '-m', 'hotfix')
    sh(app, 'push', '-q', 'origin', 'HEAD:refs/heads/main')
    checkoutStaging()
    commitOnStaging('more work')
    await assert.rejects(run(pikkuReleasePrepare), /Merge main into staging/)
  })

  test('go-live releases 1.0.0 even with nothing new, then refuses', async () => {
    await ship()
    const prepared = await ship({ goLive: true })
    assert.equal(prepared.version, '1.0.0')
    commitOnStaging('after launch')
    await assert.rejects(
      run(pikkuReleasePrepare, { goLive: true }),
      /Already live/
    )
  })

  test('files are named from the repo root when the app is in a subdirectory', async () => {
    const nested = join(root, 'mono')
    sh(root, 'clone', '-q', '-b', 'staging', remote, nested)
    sh(nested, 'config', 'user.email', 'dev@example.com')
    sh(nested, 'config', 'user.name', 'dev')
    mkdirSync(join(nested, 'apps', 'api'), { recursive: true })
    for (const file of ['package.json', 'CHANGELOG.md', 'surface.pikku.json']) {
      writeFileSync(
        join(nested, 'apps', 'api', file),
        readFileSync(join(app, file), 'utf-8')
      )
    }
    sh(nested, 'add', '.')
    sh(nested, 'commit', '-q', '-m', 'move app')
    sh(nested, 'push', '-q', 'origin', 'HEAD:refs/heads/staging')
    app = join(nested, 'apps', 'api')
    const prepared = await run(pikkuReleasePrepare)
    assert.deepEqual(prepared.files, [
      'apps/api/package.json',
      'apps/api/CHANGELOG.md',
      'apps/api/surface.pikku.json',
    ])
  })

  test('dry runs write nothing', async () => {
    const prepared = await run(pikkuReleasePrepare, { dryRun: true })
    assert.equal(prepared.status, 'dry-run')
    assert.equal(version(), '0.1.0')
    assert.equal(sh(app, 'status', '--porcelain'), '')
  })
})
