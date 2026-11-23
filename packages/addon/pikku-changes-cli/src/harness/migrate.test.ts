import assert from 'node:assert/strict'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runHarness, type HarnessAgent, type HarnessEvent } from './engine.js'
import { createGateWire } from './gate.js'
import { gitIn } from './git.js'
import { handTypedTablesGate } from './gates/hand-typed-tables.js'
import { needsMigrate, parseDbGenerate, runDbStep } from './migrate.js'
import { InMemorySteps } from './steps.js'
import { removeThrowaways, throwawayRepo } from './test-support.js'

const FAKE_PIKKU = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'fake-pikku.mjs'
)
before(() => chmod(FAKE_PIKKU, 0o755))
after(removeThrowaways)

const ids = { shortId: 'k3x9', changeId: 'chg_0123456789', changeset: 'cs_abc' }

/** A repo whose Pikku project root is the repository root. */
const project = () =>
  throwawayRepo({ 'pikku.config.json': '{}\n', 'src/a.ts': 'export {}\n' })

/** An agent that writes the given files on each turn and commits them. */
const scriptedAgent = (worktree: string, turns: Record<string, string>[]) => {
  const feedback: (string | undefined)[] = []
  const agent: HarnessAgent = async ({ attempt, feedback: said }) => {
    feedback.push(said)
    const edits = turns[attempt - 1] ?? {}
    for (const [path, content] of Object.entries(edits)) {
      await mkdir(dirname(join(worktree, path)), { recursive: true })
      await writeFile(join(worktree, path), content)
    }
    const git = gitIn(worktree)
    await git(['add', '-A', '--', ...Object.keys(edits)])
    await git(['commit', '-q', '-m', `feat: #k3x9 attempt ${attempt}`])
    return { outcome: 'done' }
  }
  return { agent, feedback }
}

const harness = async (worktree: string, agent: HarnessAgent) => {
  const events: HarnessEvent[] = []
  let done = 0
  const result = await runHarness({
    worktree,
    base: 'main',
    ...ids,
    harness: { name: 'db', gates: [handTypedTablesGate()] },
    agent,
    steps: new InMemorySteps(),
    onEvent: (event) => events.push(event),
    markDone: async () => {
      done++
    },
    migrate: { binary: FAKE_PIKKU },
  })
  return { result, events, done }
}

const calls = async (repo: string) =>
  (await readFile(join(repo, '.pikku', 'calls'), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)

const subjects = async (repo: string) =>
  (await gitIn(repo)(['log', '--format=%s', 'main..HEAD'])).trim().split('\n')

describe('the db step', () => {
  test('a changed db/tables.ts: the migration db generate writes is committed by the engine, then migrate and all run', async () => {
    const repo = await project()
    await gitIn(repo)(['checkout', '-q', '-b', 'changeset/1'])
    const { agent } = scriptedAgent(repo, [
      { 'db/tables.ts': 'table:guestbook\n' },
    ])
    const { result, events, done } = await harness(repo, agent)
    assert.equal(result.status, 'done')
    assert.equal(done, 1)
    assert.deepEqual(await calls(repo), ['db generate', 'db migrate', 'all'])
    assert.deepEqual(await subjects(repo), [
      'style(db): #k3x9 generate migrations',
      'feat: #k3x9 attempt 1',
    ])
    const body = await gitIn(repo)(['log', '-1', '--format=%b'])
    assert.match(body, /Change-Id: chg_0123456789\nChangeset: cs_abc/)
    assert.deepEqual(
      (await gitIn(repo)(['show', '--name-only', '--format=', 'HEAD'])).trim(),
      'db/sqlite/0001-guestbook.sql'
    )
    assert.match(
      await readFile(join(repo, '.pikku/db/schema.gen.ts'), 'utf8'),
      /0001-guestbook\.sql/
    )
    assert.ok(
      events.some(
        (e) => e.name === 'attempt-1:db' && e.gate === 'db' && e.status === 'ok'
      )
    )
    // run again: nothing written, nothing committed
    const head = (await gitIn(repo)(['rev-parse', 'HEAD'])).trim()
    const again = await runDbStep({
      worktree: repo,
      migrate: { binary: FAKE_PIKKU },
      ...ids,
    })
    assert.deepEqual(again, { findings: [] })
    assert.equal((await gitIn(repo)(['rev-parse', 'HEAD'])).trim(), head)
    assert.equal(
      (await gitIn(repo)(['status', '--porcelain', '--', 'db'])).trim(),
      ''
    )
  })

  test('a changeset that touches no schema and no dependency file gets no db step', async () => {
    const repo = await project()
    await gitIn(repo)(['checkout', '-q', '-b', 'changeset/1'])
    const { agent } = scriptedAgent(repo, [
      { 'src/a.ts': 'export const a = 1\n' },
    ])
    const { result } = await harness(repo, agent)
    assert.equal(result.status, 'done')
    assert.deepEqual(await calls(repo), [])
    assert.equal(await needsMigrate(repo, 'main'), false)
    await writeFile(join(repo, 'package.json'), '{}\n')
    await gitIn(repo)(['add', 'package.json'])
    await gitIn(repo)(['commit', '-q', '-m', 'deps'])
    assert.equal(await needsMigrate(repo, 'main'), true)
  })

  test('a DROP goes back to the builder as a finding, never --allowDestructive; the fixed attempt passes', async () => {
    const repo = await project()
    await gitIn(repo)(['checkout', '-q', '-b', 'changeset/1'])
    const { agent, feedback } = scriptedAgent(repo, [
      { 'db/tables.ts': 'table:guestbook\ndrop:visits\n' },
      { 'db/tables.ts': 'table:guestbook\n' },
    ])
    const { result, done } = await harness(repo, agent)
    assert.equal(result.status, 'done')
    assert.equal(result.attempts, 2)
    assert.equal(done, 1)
    assert.match(feedback[1]!, /db \(1\)/)
    assert.match(feedback[1]!, /DROP TABLE visits/)
    assert.match(
      feedback[1]!,
      /Never pass --allowDestructive\. If the change needs this, stop and say so/
    )
    assert.ok(!(await calls(repo)).some((c) => c.includes('allowDestructive')))
    // attempt 1 stopped at generate; attempt 2 generated, migrated and built
    assert.deepEqual(await calls(repo), [
      'db generate',
      'db generate',
      'db migrate',
      'all',
    ])
  })

  test('db generate failing on its own is infra with its output redacted, and the builder hears nothing', async () => {
    const repo = await project()
    await gitIn(repo)(['checkout', '-q', '-b', 'changeset/1'])
    const { agent, feedback } = scriptedAgent(repo, [
      { 'db/tables.ts': 'broken\n' },
    ])
    const { result, done } = await harness(repo, agent)
    assert.equal(result.status, 'infra')
    assert.equal(result.infra!.gate, 'db')
    assert.equal(result.infra!.kind, 'exit-code')
    assert.match(result.infra!.message, /could not open the database/)
    assert.ok(!result.infra!.message.includes('hunter2hunter2'))
    assert.equal(done, 0)
    assert.equal(feedback.length, 1)
  })

  test("codegen errors from pikku all in the builder's code are left to the check stage, not infra", async () => {
    const repo = await project()
    await gitIn(repo)(['checkout', '-q', '-b', 'changeset/1'])
    const { agent } = scriptedAgent(repo, [
      { 'db/tables.ts': 'table:x\ncodegen-error\n' },
    ])
    const { result, done } = await harness(repo, agent)
    assert.equal(result.status, 'done')
    assert.equal(done, 1)
    assert.deepEqual(await calls(repo), ['db generate', 'db migrate', 'all'])
  })

  test('a tracked file written by pikku all is infra, not committed', async () => {
    const repo = await project()
    await gitIn(repo)(['checkout', '-q', '-b', 'changeset/1'])
    const { agent } = scriptedAgent(repo, [
      { 'db/tables.ts': 'table:x\ntracked\n' },
    ])
    const { result } = await harness(repo, agent)
    assert.equal(result.status, 'infra')
    assert.equal(result.infra!.kind, 'write-outside-allowlist')
    assert.match(result.infra!.message, /README\.md/)
  })

  test('the starter layout: a migration under packages/functions/db/sqlite/ with its config there triggers the step', async () => {
    const repo = await throwawayRepo({
      'packages/functions/pikku.config.json': '{ "rootDir": "." }\n',
    })
    const git = gitIn(repo)
    await git(['checkout', '-q', '-b', 'changeset/1'])
    await mkdir(join(repo, 'packages/functions/src/db/sqlite'), {
      recursive: true,
    })
    await writeFile(
      join(repo, 'packages/functions/src/db/sqlite/x.sql'),
      'select 1;\n'
    )
    await git(['add', '-A'])
    await git(['commit', '-q', '-m', 'not a migration'])
    assert.equal(await needsMigrate(repo, 'main'), false)
    await mkdir(join(repo, 'packages/functions/db/sqlite'), { recursive: true })
    await writeFile(
      join(repo, 'packages/functions/db/sqlite/0004-app-tables.sql'),
      'create table x ();\n'
    )
    await git(['add', '-A'])
    await git(['commit', '-q', '-m', 'migration'])
    assert.equal(await needsMigrate(repo, 'main'), true)
  })

  test('a dev database that applied a migration the builder then deleted is rebuilt from the committed migrations', async () => {
    const repo = await project()
    const git = gitIn(repo)
    await git(['checkout', '-q', '-b', 'changeset/1'])
    await mkdir(join(repo, 'db'), { recursive: true })
    await writeFile(join(repo, 'db/tables.ts'), 'table:a\n')
    await git(['add', '-A'])
    await git(['commit', '-q', '-m', 'feat: #k3x9 a'])
    const migrate = { binary: FAKE_PIKKU }
    await runDbStep({ worktree: repo, migrate, ...ids })
    // the builder drops the migrated table and its migration, and declares another
    await writeFile(join(repo, 'db/tables.ts'), 'table:b\n')
    await git(['rm', '-q', 'db/sqlite/0001-a.sql'])
    await git(['add', '-A'])
    await git(['commit', '-q', '-m', 'feat: #k3x9 b instead'])
    const result = await runDbStep({ worktree: repo, migrate, ...ids })
    assert.deepEqual(result.findings, [])
    assert.deepEqual((await calls(repo)).slice(3), [
      'db generate',
      'db migrate',
      'db reset --no-seed',
      'all',
    ])
    assert.equal(
      (await readFile(join(repo, '.pikku/applied'), 'utf8')).trim(),
      '0001-b.sql'
    )
  })

  test('parseDbGenerate: a refusal is a finding, a clean exit or another failure is not', () => {
    assert.deepEqual(
      parseDbGenerate({ stdout: 'db generate: wrote x', stderr: '', code: 0 }),
      []
    )
    assert.deepEqual(
      parseDbGenerate({ stdout: '', stderr: 'boom', code: 1 }),
      []
    )
    const [refused] = parseDbGenerate({
      stdout: '',
      stderr:
        'db generate: refused to write the migration for db/tables.ts:\n  guestbook.id has no type\n',
      code: 1,
    })
    assert.equal(refused!.rule, 'harness/db-generate')
    assert.match(refused!.message, /guestbook\.id has no type/)
  })
})

describe('handTypedTablesGate', () => {
  test('an added withTables<...>() line is a finding at its file and line; one already on the base is not', async () => {
    const repo = await throwawayRepo({
      'packages/functions/src/old.ts': 'const db = kysely.withTables<Old>()\n',
    })
    const git = gitIn(repo)
    await git(['checkout', '-q', '-b', 'changeset/1'])
    const file = 'packages/functions/src/functions/guestbook.function.ts'
    await mkdir(join(repo, dirname(file)), { recursive: true })
    await writeFile(
      join(repo, file),
      "import { x } from 'y'\n\nconst db = kysely.withTables<GuestbookTables>()\nconst other = kysely.withTables(schema)\n"
    )
    await git(['add', '-A'])
    await git(['commit', '-q', '-m', 'feat: #1 guestbook'])
    const findings = await handTypedTablesGate().run(
      createGateWire({
        worktree: repo,
        base: 'main',
        attempt: 1,
        changeId: 'c',
        scratch: join(repo, '.git'),
      })
    )
    assert.deepEqual(
      findings.map((f) => [f.file, f.line, f.severity, f.rule]),
      [
        [file, 3, 'high', 'harness/hand-typed-tables'],
        [file, 4, 'high', 'harness/hand-typed-tables'],
      ]
    )
    assert.match(
      findings[0]!.message,
      /declare the table with defineTables in db\/tables\.ts, run `pikku db generate` and `pikku db migrate`, and use the generated types/i
    )
  })
})
