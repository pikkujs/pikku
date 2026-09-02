import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { KnowledgeService } from './knowledge.service.js'

const project = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-console-knowledge-'))
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(root, rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, contents, 'utf8')
  }
  return root
}

const service = (root: string) =>
  new KnowledgeService(root, join(root, '.pikku'))

describe('KnowledgeService', () => {
  test('returns the graph and the same verdict the CLI would give', async () => {
    const root = await project({
      'knowledge/index.md':
        '---\ntype: overview\ntitle: Knowledge\n---\n[decisions](decisions/index.md)',
      'knowledge/decisions/index.md': '---\ntype: overview\n---\nRules.',
      'knowledge/decisions/why.md':
        '---\ntype: decision\ntitle: Why\ntags: [access]\n---\nBecause.',
    })
    const bundle = await service(root).getBundle()

    assert.equal(bundle.ok, true)
    assert.deepEqual(bundle.findings, [])
    assert.equal(bundle.stats.notes, 3)
    assert.deepEqual(
      bundle.sections.map((s) => s.name),
      ['decisions']
    )
    assert.deepEqual(bundle.tagCounts, { access: 1 })
  })

  test('reports findings without refusing to return the graph', async () => {
    // The console is a browser, not a gate: a base with problems is exactly when
    // a reader most needs to see it, so the notes come back alongside the verdict.
    const root = await project({
      'knowledge/slices/01-a.md': '# No frontmatter at all\n',
    })
    const bundle = await service(root).getBundle()
    assert.equal(bundle.ok, false)
    assert.ok(bundle.findings.length > 0)
    assert.equal(bundle.notes.length, 1)
  })

  test('a project with no knowledge base returns an empty bundle, not an error', async () => {
    const root = await project({ 'package.json': '{}' })
    const bundle = await service(root).getBundle()
    assert.deepEqual(bundle.notes, [])
    assert.equal(bundle.ok, true)
  })

  test('re-reads the notes on every call, so an edit shows up without a restart', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nx',
    })
    const instance = service(root)
    assert.equal((await instance.getBundle()).stats.notes, 1)

    await mkdir(join(root, 'knowledge', 'questions'), { recursive: true })
    await writeFile(
      join(root, 'knowledge', 'questions', 'who-owns-a-day.md'),
      '---\ntype: note\n---\nAsked, not answered.',
      'utf8'
    )
    assert.equal((await instance.getBundle()).stats.notes, 2)
  })
})

describe('KnowledgeService milestone plans', () => {
  const MILESTONE = 'knowledge/milestones/01-the-daily-entry.md'

  const NOTE = `---
type: milestone
entities: entry
---
The daily entry.

\`\`\`gherkin
Given 'owner' has today free
When 'owner' writes an entry
Then 'owner' reads it back
\`\`\`
`

  const plan = {
    version: 1,
    deferrals: [],
    milestone: MILESTONE,
    description: 'One person writes one entry a day.',
    covers: [
      { note: 'entities/entry.md', hash: 'a1b2c3d4e5f6', complete: true },
    ],
    model: { kind: 'n/a', description: 'No tables yet.' },
    functions: {
      kind: 'built',
      description: 'Write.',
      items: [
        {
          name: 'createEntry',
          description: "Creates today's entry.",
          pass: 1,
          wire: { transport: 'http', route: 'POST /entry' },
          scopes: [],
          permission: 'Only the signed-in person writes their own entry',
        },
      ],
    },
    roles: { kind: 'n/a', description: 'One person.' },
    scopes: { kind: 'n/a', description: 'No third-party access yet.' },
    ui: { kind: 'n/a', description: 'No screen yet.' },
    scenarios: {
      backend: { kind: 'n/a', description: 'None yet.' },
      browser: { kind: 'n/a', description: 'None yet.' },
      permission: { kind: 'n/a', description: 'None yet.' },
    },
  }

  test('a milestone with a plan carries it, reconciled against the meta', async () => {
    const root = await project({
      [MILESTONE]: NOTE,
      'knowledge/milestones/01-the-daily-entry.plan.json': JSON.stringify(plan),
      '.pikku/function/pikku-functions-meta.gen.json': JSON.stringify({
        createEntry: { auth: true },
      }),
      '.pikku/http/pikku-http-wirings-meta.gen.json': JSON.stringify({
        POST: { '/entry': {} },
      }),
    })
    const bundle = await service(root).getBundle()

    const milestone = bundle.plans[MILESTONE]
    assert.ok(milestone)
    assert.equal(milestone.unavailable, null)
    assert.equal(
      milestone.plan?.description,
      'One person writes one entry a day.'
    )
    assert.equal(milestone.complete, true)
    assert.deepEqual(
      milestone.checklist.map((item) => [item.id, item.done]),
      [
        ['function:createEntry', true],
        ['wire:POST /entry', true],
      ]
    )
  })

  test('a plan the meta cannot account for reads as incomplete rather than as absent', async () => {
    const root = await project({
      [MILESTONE]: NOTE,
      'knowledge/milestones/01-the-daily-entry.plan.json': JSON.stringify(plan),
    })
    const bundle = await service(root).getBundle()

    const milestone = bundle.plans[MILESTONE]
    assert.equal(milestone?.complete, false)
    assert.deepEqual(
      milestone?.checklist.map((item) => item.done),
      [false, false]
    )
  })

  test('a milestone nobody planned says so, rather than going missing from the bundle', async () => {
    // A note with no plan beside it is the state the console most needs to show —
    // dropping the key would render exactly like a milestone that was never written.
    const root = await project({ [MILESTONE]: NOTE })
    const bundle = await service(root).getBundle()

    const milestone = bundle.plans[MILESTONE]
    assert.ok(milestone)
    assert.equal(milestone.plan, null)
    assert.match(milestone.unavailable ?? '', /No plan at/)
    assert.deepEqual(milestone.checklist, [])
  })

  test('a base with no milestones carries no plans', async () => {
    const root = await project({
      'knowledge/decisions/why.md': '---\ntype: decision\n---\nBecause.',
    })
    assert.deepEqual((await service(root).getBundle()).plans, {})
  })
})
