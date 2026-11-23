import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { commitFixes, fixCommitMessage } from './commit.js'
import { HarnessInfraError } from './finding.js'
import { createGateWire, type HarnessGate } from './gate.js'
import { gitIn } from './git.js'
import { oxfmtGate } from './gates/oxfmt.js'
import { parseOxfmtWrite } from './gates/oxfmt-parser.js'
import {
  FAKE_CLI,
  REPO_ROOT,
  removeThrowaways,
  throwawayRepo,
} from './test-support.js'
import { guardWrites, snapshotTree } from './write-guard.js'

after(removeThrowaways)

const ids = {
  shortId: 'k3x9',
  changeId: 'chg_0123456789',
  changeset: 'cs_abc',
}

/** Engine order for a fixer: snapshot, run, guard, commit, then its check mode. */
const runFixer = async (gate: HarnessGate, worktree: string) => {
  const wire = createGateWire({
    worktree,
    base: 'main',
    attempt: 1,
    changeId: ids.changeId,
    scratch: join(REPO_ROOT, '.tmp'),
  })
  const before = await snapshotTree(worktree)
  const findings = await gate.run(wire)
  const paths = await guardWrites({
    worktree,
    before,
    writes: gate.writes,
    gate: gate.name,
  })
  const sha = await commitFixes({
    worktree,
    paths,
    gate: gate.name,
    message: 'format sources',
    ...ids,
  })
  return { findings, sha, check: await gate.check?.(wire) }
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
    const fakeFormatter: HarnessGate = {
      name: 'fakefmt',
      description: 'rewrites src/a.ts',
      failOn: 'medium',
      writes: ['**/*.{ts,tsx}'],
      run: (wire) =>
        wire.runCli(['write', 'src/a.ts', 'export const a = 1\n'], {
          binary: FAKE_CLI,
          parse: parseOxfmtWrite,
        }),
    }
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

  const OXFMT =
    process.env.OXFMT_BIN ??
    join(REPO_ROOT, '.tmp/harness-tools/node_modules/.bin/oxfmt')

  test(
    'oxfmt formats only TypeScript, commits once, and its check mode is clean after',
    {
      skip: existsSync(OXFMT) ? false : `no oxfmt at ${OXFMT} (set OXFMT_BIN)`,
    },
    async () => {
      const repo = await throwawayRepo({
        'src/a.ts': 'export const  b={a:1}\n',
        'src/b.tsx': 'export const  c={a:1}\n',
        'data.json': '{"a":1,\n"b":2}\n',
      })
      const { findings, check } = await runFixer(
        oxfmtGate({ binary: OXFMT }),
        repo
      )
      assert.deepEqual(findings, [])
      assert.deepEqual(check, [])
      const git = gitIn(repo)
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
})
