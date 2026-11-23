import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { HarnessInfraError } from '../finding.js'
import { createGateWire } from '../gate.js'
import { gitIn } from '../git.js'
import { REPO_ROOT, removeThrowaways, throwawayRepo } from '../test-support.js'
import { oxlintGate } from './oxlint.js'

after(removeThrowaways)

const OXLINT = realpathSync(join(REPO_ROOT, 'node_modules/.bin/oxlint'))
const wireFor = (worktree: string) =>
  createGateWire({
    worktree,
    base: 'main',
    attempt: 1,
    changeId: 'chg_1',
    scratch: join(REPO_ROOT, '.tmp'),
  })

describe('oxlintGate', () => {
  test('reports an error as a high finding with file and line', async () => {
    const repo = await throwawayRepo({
      '.oxlintrc.json': '{"rules":{"no-debugger":"error"}}',
      'src/a.ts': 'export const a = 1\ndebugger\n',
    })
    const findings = await oxlintGate({ binary: OXLINT }).run(wireFor(repo))
    assert.deepEqual(findings, [
      {
        file: 'src/a.ts',
        line: 2,
        severity: 'high',
        rule: 'eslint/no-debugger',
        message:
          '`debugger` statement is not allowed. Remove the debugger statement',
      },
    ])
  })

  test('a clean tree has no findings', async () => {
    const repo = await throwawayRepo({ 'src/a.ts': 'export const a = 1\n' })
    assert.deepEqual(
      await oxlintGate({ binary: OXLINT }).run(wireFor(repo)),
      []
    )
  })

  test('a changeset that loosens the lint config fails on the config change, judged by the base branch', async () => {
    const repo = await throwawayRepo({
      '.oxlintrc.json': '{"rules":{"no-debugger":"error"}}',
      'src/a.ts': 'export const a = 1\n',
    })
    const git = gitIn(repo)
    await git(['checkout', '-q', '-b', 'changeset/one'])
    await writeFile(join(repo, '.oxlintrc.json'), '{"rules":{}}')
    await git(['commit', '-qam', 'loosen lint'])
    const findings = await oxlintGate({ binary: OXLINT }).run(wireFor(repo))
    assert.deepEqual(findings, [
      {
        file: '.oxlintrc.json',
        severity: 'high',
        rule: 'harness/lint-config',
        message:
          'the changeset changes the lint config .oxlintrc.json; lint is judged by the config on main, so revert this change',
      },
    ])
  })

  test('changedOnly counts findings in the files the changeset changed, not what the base branch already had', async () => {
    const repo = await throwawayRepo({
      '.oxlintrc.json': '{"rules":{"no-debugger":"error"}}',
      'src/old.ts': 'export const old = 1\ndebugger\n',
    })
    const git = gitIn(repo)
    await git(['checkout', '-q', '-b', 'changeset/one'])
    await writeFile(join(repo, 'src/new.ts'), 'export const b = 1\ndebugger\n')
    await git(['add', '-A'])
    await git(['commit', '-qm', 'new'])
    const all = await oxlintGate({ binary: OXLINT }).run(wireFor(repo))
    assert.deepEqual(all.map((f) => f.file).sort(), [
      'src/new.ts',
      'src/old.ts',
    ])
    const changed = await oxlintGate({ binary: OXLINT, changedOnly: true }).run(
      wireFor(repo)
    )
    assert.deepEqual(
      changed.map((f) => f.file),
      ['src/new.ts']
    )
  })

  test('nothing to lint exits 1 with no findings and throws', async () => {
    const repo = await throwawayRepo()
    await assert.rejects(
      oxlintGate({ binary: OXLINT, paths: ['missing.ts'] }).run(wireFor(repo)),
      (error) =>
        error instanceof HarnessInfraError &&
        error.kind === 'exit-code' &&
        /No files found to lint/.test(error.message)
    )
  })
})
