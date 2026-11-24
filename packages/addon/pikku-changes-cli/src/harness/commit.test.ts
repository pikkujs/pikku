import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { commitFixes, fixCommitMessage } from './commit.js'
import { HarnessInfraError } from './finding.js'
import { pikkuHarnessGate, type PikkuHarnessGate } from '@pikku/core/harness'
import { gitIn } from './git.js'
import { oxfmtGate } from './gates/oxfmt.js'
import { parseOxfmtWrite } from './gates/oxfmt-parser.js'
import {
  REPO_ROOT,
  removeThrowaways,
  runGate,
  testGateWire,
  throwawayRepo,
} from './test-support.js'
import { guardWrites, snapshotTree } from './write-guard.js'

after(removeThrowaways)

const ids = {
  shortId: 'k3x9',
  changeId: 'chg_0123456789',
  changeset: 'cs_abc',
}

/**
 * Engine order for a fixer: snapshot, run, guard, commit. Then it runs again, as the next attempt
 * would: `again` is what that run found and `changedAgain` what it changed, both empty for an
 * idempotent fixer.
 */
const runFixer = async (
  gate: PikkuHarnessGate,
  worktree: string,
  tools?: Record<string, string>
) => {
  const wire = testGateWire(
    { worktree, changeId: ids.changeId, scratch: join(REPO_ROOT, '.tmp') },
    tools
  )
  const guarded = async () => {
    const before = await snapshotTree(worktree)
    const findings = await runGate(gate, wire)
    const paths = await guardWrites({
      worktree,
      before,
      writes: gate.writes,
      gate: gate.name,
    })
    return { findings, paths }
  }
  const { findings, paths } = await guarded()
  const sha = await commitFixes({
    worktree,
    paths,
    gate: gate.name,
    message: 'format sources',
    ...ids,
  })
  const next = await guarded()
  return { findings, sha, again: next.findings, changedAgain: next.paths }
}

const log = async (repo: string) =>
  (await gitIn(repo)(['log', '--format=%B%x00'])).split('\0\n').filter(Boolean)

describe('fixCommitMessage', () => {
  test('subject, Change-Id trailer and Changeset reference', () => {
    assert.equal(
      fixCommitMessage({ gate: 'oxfmt', message: 'format sources', ...ids }),
      'style(oxfmt): #k3x9 format sources\n\nChange-Id: chg_0123456789\nChangeset: cs_abc\n'
    )
  })

  test('a message cannot inject a trailer of its own', () => {
    const message = fixCommitMessage({
      gate: 'oxfmt',
      message: 'x\n\nChange-Id: forged',
      ...ids,
      shortId: '#k3x9',
    })
    assert.equal(
      message.split('\n')[0],
      'style(oxfmt): #k3x9 x Change-Id: forged'
    )
    assert.equal(message.match(/^Change-Id:/gm)?.length, 1)
  })
})

describe('commitFixes', () => {
  test('refuses an empty commit', async () => {
    const repo = await throwawayRepo()
    await assert.rejects(
      commitFixes({ worktree: repo, gate: 'oxfmt', message: 'm', ...ids }),
      (error) =>
        error instanceof HarnessInfraError && error.kind === 'empty-commit'
    )
    assert.equal((await log(repo)).length, 1)
  })

  test('a fixer run ends in one commit with the trailer', async () => {
    const repo = await throwawayRepo({ 'src/a.ts': 'export const a  =  1\n' })
    const fakeFormatter = pikkuHarnessGate({
      name: 'fakefmt',
      description: 'rewrites src/a.ts',
      failOn: 'medium',
      writes: ['**/*.{ts,tsx}'],
      func: (_services, _data, { gate }) =>
        gate.runCli(['write', 'src/a.ts', 'export const a = 1\n'], {
          binary: gate.tool('fake-cli'),
          parse: parseOxfmtWrite,
        }),
    })
    const { findings, sha } = await runFixer(fakeFormatter, repo)
    assert.deepEqual(findings, [])
    const messages = await log(repo)
    assert.equal(messages.length, 2)
    assert.equal(
      messages[0],
      'style(fakefmt): #k3x9 format sources\n\nChange-Id: chg_0123456789\nChangeset: cs_abc\n'
    )
    const git = gitIn(repo)
    assert.equal((await git(['rev-parse', 'HEAD'])).trim(), sha)
    assert.equal(await git(['status', '--porcelain', '-uall']), '')
    assert.equal(
      (await git(['interpret-trailers', '--parse'], messages[0])).trim(),
      'Change-Id: chg_0123456789\nChangeset: cs_abc'
    )
  })

  test('run again after it committed, it returns HEAD and makes no second commit', async () => {
    const repo = await throwawayRepo({ 'src/a.ts': 'export const a  =  1\n' })
    await writeFile(join(repo, 'src/a.ts'), 'export const a = 1\n')
    const commit = { worktree: repo, gate: 'fakefmt', message: 'm', ...ids }
    const first = await commitFixes({ ...commit, paths: ['src/a.ts'] })
    const again = await commitFixes({ ...commit, paths: ['src/a.ts'] })
    assert.equal(again, first)
    assert.equal((await log(repo)).length, 2)
    await assert.rejects(
      commitFixes({ ...commit, message: 'other', paths: ['src/a.ts'] }),
      (error) =>
        error instanceof HarnessInfraError && error.kind === 'empty-commit'
    )
  })

  const OXFMT =
    process.env.OXFMT_BIN ??
    join(REPO_ROOT, '.tmp/harness-tools/node_modules/.bin/oxfmt')

  test(
    'oxfmt formats only TypeScript, commits once, and run again changes nothing',
    {
      skip: existsSync(OXFMT) ? false : `no oxfmt at ${OXFMT} (set OXFMT_BIN)`,
    },
    async () => {
      const repo = await throwawayRepo()
      const git = gitIn(repo)
      await git(['checkout', '-q', '-b', 'changeset/one'])
      await mkdir(join(repo, 'src'))
      for (const [path, content] of Object.entries({
        'src/a.ts': 'export const  b={a:1}\n',
        'src/b.tsx': 'export const  c={a:1}\n',
        'data.json': '{"a":1,\n"b":2}\n',
      }))
        await writeFile(join(repo, path), content)
      await git(['add', '-A'])
      await git(['commit', '-qm', 'change'])
      const { findings, again, changedAgain } = await runFixer(
        oxfmtGate,
        repo,
        { oxfmt: OXFMT }
      )
      assert.deepEqual(findings, [])
      assert.deepEqual(again, [])
      assert.deepEqual(changedAgain, [])
      assert.equal(
        (await git(['show', '--name-only', '--format=', 'HEAD'])).trim(),
        'src/a.ts\nsrc/b.tsx'
      )
      assert.equal(
        await readFile(join(repo, 'data.json'), 'utf8'),
        '{"a":1,\n"b":2}\n'
      )
      assert.match(
        (await log(repo))[0]!,
        /^style\(oxfmt\): #k3x9 format sources\n\nChange-Id: chg_0123456789\n/
      )
    }
  )

  test(
    'oxfmt formats the sources the changeset changed and leaves the base branch’s alone',
    {
      skip: existsSync(OXFMT) ? false : `no oxfmt at ${OXFMT} (set OXFMT_BIN)`,
    },
    async () => {
      const repo = await throwawayRepo({
        'src/old.ts': 'export const  old={a:1}\n',
      })
      const git = gitIn(repo)
      await git(['checkout', '-q', '-b', 'changeset/one'])
      await writeFile(join(repo, 'src/new.ts'), 'export const  b={a:1}\n')
      await git(['add', '-A'])
      await git(['commit', '-qm', 'new'])
      const { findings, again } = await runFixer(oxfmtGate, repo, {
        oxfmt: OXFMT,
      })
      assert.deepEqual(findings, [])
      assert.deepEqual(again, [])
      assert.equal(
        (await git(['show', '--name-only', '--format=', 'HEAD'])).trim(),
        'src/new.ts'
      )
      assert.equal(
        await readFile(join(repo, 'src/old.ts'), 'utf8'),
        'export const  old={a:1}\n'
      )
    }
  )
})
