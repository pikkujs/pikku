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
