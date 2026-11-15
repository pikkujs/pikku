import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '@pikku/cli/addon-support'
import {
  FILING_MARKER_TTL_MS,
  filingMarkerPath,
  freshFilingMarker,
  markFiling,
  refuseWhileFiling,
} from './filing-guard.js'

const repo = async () => {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), 'pikku-filing-')))
  await git(['init', '-q'], dir)
  await git(
    [
      '-c',
      'user.email=t@example.com',
      '-c',
      'user.name=t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'init',
    ],
    dir
  )
  return dir
}

afterEach(() => {
  delete process.env.PIKKU_CHANGES_BUILDER
  delete process.env.PIKKU_CHANGES_FILING_ONLY
})

describe('the intake marker', () => {
  test('is written in the checkout’s .pikku/ with the route and the time', async () => {
    const dir = await repo()
    const at = new Date('2026-11-15T10:00:00Z')
    await markFiling('intake', dir, at)
    const path = await filingMarkerPath(dir)
    assert.strictEqual(path, join(dir, '.pikku', 'changes-filing.json'))
    assert.deepStrictEqual(JSON.parse(await readFile(path!, 'utf8')), {
      route: 'intake',
      at: at.toISOString(),
    })
  })

  test('a worktree sees the main checkout’s marker', async () => {
    const dir = await repo()
    const tree = `${dir}-tree`
    await git(['worktree', 'add', '-q', tree], dir)
    await markFiling('intake', dir)
    assert.strictEqual(
      await filingMarkerPath(tree),
      join(dir, '.pikku', 'changes-filing.json')
    )
    assert.ok(await freshFilingMarker(tree))
  })

  test('is stale after two hours', async () => {
    const dir = await repo()
    const at = new Date()
    await markFiling('intake', dir, at)
    assert.ok(await freshFilingMarker(dir, at.getTime() + 60_000))
    assert.strictEqual(
      await freshFilingMarker(dir, at.getTime() + FILING_MARKER_TTL_MS),
      null
    )
  })

  test('outside a git checkout there is no marker and nothing refuses', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pikku-nogit-'))
    assert.strictEqual(await filingMarkerPath(dir), null)
    await refuseWhileFiling('claim', dir)
  })
})

describe('refusing while filing', () => {
  test('a fresh marker refuses claim, naming the route', async () => {
    const dir = await repo()
    await markFiling('intake', dir)
    await assert.rejects(
      refuseWhileFiling('claim', dir),
      /handed the intake route .* cannot claim one\. You are done: stop here/
    )
  })

  test('the builder env gets past a fresh marker', async () => {
    const dir = await repo()
    await markFiling('intake', dir)
    process.env.PIKKU_CHANGES_BUILDER = '1'
    await refuseWhileFiling('merge', dir)
  })

  test('a stale marker refuses nothing', async () => {
    const dir = await repo()
    await markFiling(
      'intake',
      dir,
      new Date(Date.now() - FILING_MARKER_TTL_MS - 1000)
    )
    await refuseWhileFiling('finish', dir)
  })

  test('no marker refuses nothing', async () => {
    await refuseWhileFiling('finish', await repo())
  })

  test('PIKKU_CHANGES_FILING_ONLY still refuses, even for a builder', async () => {
    process.env.PIKKU_CHANGES_FILING_ONLY = '1'
    process.env.PIKKU_CHANGES_BUILDER = '1'
    await assert.rejects(
      refuseWhileFiling('claim', await repo()),
      /only files changes, so it cannot claim one/
    )
  })
})
