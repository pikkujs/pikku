import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { HarnessInfraError } from '../finding.js'
import { gitIn } from '../git.js'
import {
  REPO_ROOT,
  removeThrowaways,
  runGate,
  testGateWire,
  throwawayRepo,
} from '../test-support.js'
import { oxlintGate } from './oxlint.js'

after(removeThrowaways)

const OXLINT = realpathSync(join(REPO_ROOT, 'node_modules/.bin/oxlint'))
const lint = (
  worktree: string,
  tools: Record<string, string> = { oxlint: OXLINT }
) => runGate(oxlintGate, testGateWire({ worktree }, tools))

/** A repo whose `main` holds `base`, on a changeset branch that commits `changed`. */
const changeset = async (
  base: Record<string, string>,
  changed: Record<string, string> = {}
) => {
  const repo = await throwawayRepo(base)
  const git = gitIn(repo)
  await git(['checkout', '-q', '-b', 'changeset/one'])
  for (const [path, content] of Object.entries(changed)) {
    await mkdir(dirname(join(repo, path)), { recursive: true })
    await writeFile(join(repo, path), content)
  }
  if (Object.keys(changed).length) {
    await git(['add', '-A'])
    await git(['commit', '-qm', 'change'])
  }
  return repo
}

describe('oxlintGate', () => {
  test('reports an error in a changed file as a high finding with file and line', async () => {
    const repo = await changeset(
      { '.oxlintrc.json': '{"rules":{"no-debugger":"error"}}' },
      { 'src/a.ts': 'export const a = 1\ndebugger\n' }
    )
    assert.deepEqual(await lint(repo), [
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

  test('a clean change has no findings', async () => {
    const repo = await changeset({}, { 'src/a.ts': 'export const a = 1\n' })
    assert.deepEqual(await lint(repo), [])
  })

  test('a changeset that loosens the lint config fails on the config change, judged by the base branch', async () => {
    const repo = await changeset(
      {
        '.oxlintrc.json': '{"rules":{"no-debugger":"error"}}',
        'src/a.ts': 'export const a = 1\n',
      },
      { '.oxlintrc.json': '{"rules":{}}' }
    )
    assert.deepEqual(await lint(repo), [
      {
        file: '.oxlintrc.json',
        severity: 'high',
        rule: 'harness/lint-config',
        message:
          'the changeset changes the lint config .oxlintrc.json; lint is judged by the config on main, so revert this change',
      },
    ])
  })

  test('only findings in the files the changeset changed count, not what the base branch already had', async () => {
    const repo = await changeset(
      {
        '.oxlintrc.json': '{"rules":{"no-debugger":"error"}}',
        'src/old.ts': 'export const old = 1\ndebugger\n',
      },
      { 'src/new.ts': 'export const b = 1\ndebugger\n' }
    )
    assert.deepEqual(
      (await lint(repo)).map((f) => f.file),
      ['src/new.ts']
    )
  })

  test('nothing to lint exits 1 with no findings and throws', async () => {
    const repo = await changeset({})
    await assert.rejects(
      lint(repo),
      (error) =>
        error instanceof HarnessInfraError &&
        error.kind === 'exit-code' &&
        /No files found to lint/.test(error.message)
    )
  })

  test('a run with no oxlint pinned cannot answer', async () => {
    const repo = await changeset({}, { 'src/a.ts': 'export const a = 1\n' })
    await assert.rejects(
      lint(repo, {}),
      (error) =>
        error instanceof HarnessInfraError &&
        error.kind === 'missing-binary' &&
        /No oxlint is pinned for this run/.test(error.message)
    )
  })
})
