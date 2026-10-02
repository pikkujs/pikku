import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { budgetLine, nextStep, type CommandRunner } from './loop.js'
import { execFileSync } from 'node:child_process'

const project = (status = 'proposed') => {
  const cwd = mkdtempSync(join(tmpdir(), 'builder-loop-'))
  mkdirSync(join(cwd, 'knowledge', 'milestones'), { recursive: true })
  writeFileSync(
    join(cwd, 'knowledge/milestones/01-the-daily-entry.md'),
    `---\ntype: milestone\ntitle: The daily entry\nstatus: ${status}\nentities: entry\n---\n\n\`\`\`gherkin\nGiven 'owner' has no entry for today\nWhen 'owner' writes one\n\`\`\`\n`
  )
  return cwd
}

const status = (cwd: string) =>
  /^status: (\w+)/m.exec(readFileSync(join(cwd, 'knowledge/milestones/01-the-daily-entry.md'), 'utf8'))?.[1]

const runner = (codes: Record<string, number>): CommandRunner & { calls: string[][] } => {
  const calls: string[][] = []
  const run = async (_cwd: string, args: string[]) => {
    calls.push(args)
    return { code: codes[args[0]!] ?? 0, output: `${args[0]} output` }
  }
  return Object.assign(run, { calls })
}

describe('nextStep', () => {
  test('stops quietly when nothing is written down', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'builder-loop-'))
    assert.deepEqual(await nextStep(cwd), { kind: 'stop', status: null })
  })

  test('asks for a plan before any build', async () => {
    const step = await nextStep(project())
    assert.equal(step.kind, 'prompt')
    assert.match(step.kind === 'prompt' ? step.message : '', /pikku knowledge plan set knowledge\/milestones\/01-the-daily-entry\.md/)
  })

  test('hands a red verify back to the agent and keeps the milestone building', async () => {
    const cwd = project('dispatched')
    const run = runner({ verify: 1 })
    const step = await nextStep(cwd, { run, apiUrl: 'http://localhost:9' })
    assert.equal(step.kind, 'prompt')
    assert.match(step.kind === 'prompt' ? step.message : '', /verify output/)
    assert.equal(status(cwd), 'dispatched')
    assert.deepEqual(run.calls, [['verify']])
  })

  test('marks the milestone built only once verify and scenarios pass', async () => {
    const cwd = project('dispatched')
    const run = runner({})
    const step = await nextStep(cwd, { run, apiUrl: 'http://localhost:9' })
    assert.equal(step.kind, 'built')
    assert.equal(status(cwd), 'built')
    assert.deepEqual(run.calls, [['verify'], ['scenario', 'run', 'local', '--api-url', 'http://localhost:9']])
  })

  test('failing scenarios keep it building', async () => {
    const cwd = project('dispatched')
    const step = await nextStep(cwd, { run: runner({ scenario: 1 }) })
    assert.equal(step.kind, 'prompt')
    assert.equal(status(cwd), 'dispatched')
  })
})

describe('commitMilestone', () => {
  test('a built milestone is committed on the branch, without the builder scratch', async () => {
    const cwd = project('dispatched')
    const sh = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
    sh('init', '-q')
    sh('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'start')
    mkdirSync(join(cwd, '.pikku'))
    writeFileSync(join(cwd, '.pikku/looks.json'), '{}')
    writeFileSync(join(cwd, 'app.ts'), 'export {}')
    const step = await nextStep(cwd, { run: runner({}) })
    assert.equal(step.kind === 'built' && step.commit, sh('rev-parse', '--short', 'HEAD'))
    assert.equal(sh('log', '-1', '--format=%s'), 'Build "The daily entry"')
    assert.deepEqual(sh('show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['app.ts', 'knowledge/milestones/01-the-daily-entry.md'])
  })
})

describe('budgetLine', () => {
  test('warns near the end of the budget', () => {
    assert.equal(budgetLine(3, 25), 'Turn 3 of 25 for this milestone.')
    assert.match(budgetLine(22, 25), /Few turns left/)
  })
})
