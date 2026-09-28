import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  pikkuReleaseInit,
  pikkuReleasePrepare,
  pikkuReleasePublish,
} from './release.js'

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
  test('prepare then publish ships a patch and moves every ref forward', async () => {
    const prepared = await run(pikkuReleasePrepare)
    assert.equal(prepared.status, 'prepared')
    assert.equal(prepared.version, '0.1.1')
    assert.equal(sh(app, 'rev-parse', 'origin/release/next'), prepared.sha)

    const published = await run(pikkuReleasePublish)
    assert.equal(published.tag, 'v0.1.1')
    sh(app, 'fetch', '-q', '--prune', '--tags', 'origin')
    assert.equal(sh(app, 'rev-parse', 'origin/main'), prepared.sha)
    assert.equal(sh(app, 'rev-parse', 'origin/staging'), prepared.sha)
    assert.equal(sh(app, 'rev-parse', 'v0.1.1^{commit}'), prepared.sha)
    assert.equal(sh(app, 'branch', '-r', '--list', 'origin/release/next'), '')
    assert.match(
      readFileSync(join(app, 'CHANGELOG.md'), 'utf-8'),
      /## 0\.1\.1 /
    )
  })

  test('reports nothing to release once trunk is live', async () => {
    await run(pikkuReleasePrepare)
    await run(pikkuReleasePublish)
    checkoutStaging()
    assert.equal((await run(pikkuReleasePrepare)).status, 'nothing')
  })

  test('a Release trailer does not change the bump', async () => {
    await run(pikkuReleasePrepare)
    await run(pikkuReleasePublish)
    checkoutStaging()
    commitOnStaging('new report\n\nRelease: major')
    const prepared = await run(pikkuReleasePrepare)
    assert.equal(prepared.previousVersion, '0.1.1')
    assert.equal(prepared.version, '0.1.2')
  })

  test('publish refuses a release prepared on an older trunk', async () => {
    await run(pikkuReleasePrepare)
    checkoutStaging()
    commitOnStaging('late change')
    await assert.rejects(
      run(pikkuReleasePublish),
      /prepared on an older staging/
    )
  })

  test('prepare refuses while production has commits trunk lacks', async () => {
    await run(pikkuReleasePrepare)
    await run(pikkuReleasePublish)
    sh(app, 'fetch', '-q', 'origin')
    sh(app, 'checkout', '-q', '--detach', 'origin/main')
    writeFileSync(join(app, 'hotfix.txt'), 'fix\n')
    sh(app, 'add', 'hotfix.txt')
    sh(app, 'commit', '-q', '-m', 'hotfix')
    sh(app, 'push', '-q', 'origin', 'HEAD:refs/heads/main')
    checkoutStaging()
    commitOnStaging('more work')
    await assert.rejects(run(pikkuReleasePrepare), /Merge main into staging/)
  })

  test('prepare does not clobber a release/next pushed by a concurrent prepare', async () => {
    const hook = join(app, '.git', 'hooks', 'pre-push')
    writeFileSync(
      hook,
      '#!/bin/sh\ngit push -q --no-verify --force origin origin/staging:refs/heads/release/next\n'
    )
    chmodSync(hook, 0o755)
    await assert.rejects(run(pikkuReleasePrepare), /another prepare ran/)
    sh(app, 'fetch', '-q', 'origin')
    assert.equal(
      sh(app, 'rev-parse', 'origin/release/next'),
      sh(app, 'rev-parse', 'origin/staging')
    )
  })

  test('dry runs write and push nothing', async () => {
    const prepared = await run(pikkuReleasePrepare, { dryRun: true })
    assert.equal(prepared.status, 'dry-run')
    assert.equal(version(), '0.1.0')
    assert.equal(sh(app, 'branch', '-r', '--list', 'origin/release/next'), '')
  })
})
