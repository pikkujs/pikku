import assert from 'node:assert'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { runKnowledgeIndex } from './reindex.js'

const project = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-kindex-'))
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(root, rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, contents, 'utf8')
  }
  return root
}

const read = (root: string, rel: string) =>
  readFile(join(root, ...rel.split('/')), 'utf8')

const milestone = (title: string, description: string) =>
  `---\ntype: milestone\ntitle: ${title}\ndescription: ${description}\nstatus: proposed\n---\nbody`

describe('runKnowledgeIndex', () => {
  test('creates a missing section index listing its notes', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nThe app.',
      'knowledge/milestones/01-a.md': milestone(
        'The daily entry',
        'One buildable piece.'
      ),
    })
    const result = await runKnowledgeIndex(root)
    assert.deepEqual(
      result.files.map((f) => [f.path, f.action]),
      [
        ['knowledge/index.md', 'updated'],
        ['knowledge/milestones/index.md', 'created'],
      ]
    )
    const created = await read(root, 'knowledge/milestones/index.md')
    assert.match(created, /^type: overview$/m)
    assert.match(
      created,
      /- \[The daily entry\]\(01-a\.md\) — One buildable piece\./
    )
  })

  test('the root index maps the sections before any loose note', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nThe app.',
      'knowledge/milestones/index.md': '---\ntype: overview\n---\nPieces.',
      'knowledge/milestones/01-a.md': milestone('A', 'a'),
      'knowledge/entities/index.md': '---\ntype: overview\n---\nThings.',
      'knowledge/entities/entry.md': '---\ntype: entity\ntitle: Entry\n---\nx',
    })
    await runKnowledgeIndex(root)
    const index = await read(root, 'knowledge/index.md')
    assert.match(index, /- \[entities\]\(entities\/index\.md\)/)
    assert.match(index, /- \[milestones\]\(milestones\/index\.md\)/)
    assert.ok(
      index.indexOf('entities/index.md') < index.indexOf('milestones/index.md')
    )
  })

  test('a nested section gets its own index and is not listed at the root', async () => {
    // decisions/design/index.md belongs to decisions/, not to the root map —
    // otherwise the root grows a listing for every level and stops being a map.
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nx',
      'knowledge/decisions/index.md': '---\ntype: overview\n---\nRules.',
      'knowledge/decisions/design/inline.md':
        '---\ntype: decision\ntitle: Inline, not toasts\n---\nx',
    })
    await runKnowledgeIndex(root)
    assert.match(
      await read(root, 'knowledge/decisions/design/index.md'),
      /Inline, not toasts/
    )
    assert.doesNotMatch(
      await read(root, 'knowledge/index.md'),
      /decisions\/design/
    )
    // The parent maps its own children, which is how a reader gets from the root
    // to a nested note in two hops instead of guessing the directory exists.
    assert.match(
      await read(root, 'knowledge/decisions/index.md'),
      /- \[design\]\(design\/index\.md\)/
    )
  })

  test('a parent that holds only sub-sections gets an index of its own', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nx',
      'knowledge/decisions/security/one.md':
        '---\ntype: decision\ntitle: One account\n---\nx',
    })
    await runKnowledgeIndex(root)
    assert.match(
      await read(root, 'knowledge/decisions/index.md'),
      /- \[security\]\(security\/index\.md\) — a rule about who may do what/
    )
    assert.match(
      await read(root, 'knowledge/index.md'),
      /- \[decisions\]\(decisions\/index\.md\)/
    )
  })

  test('replaces only the generated block, keeping the prose a human wrote', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nx',
      'knowledge/milestones/index.md': [
        '---',
        'type: overview',
        '---',
        '',
        '# Milestones',
        '',
        'Read these in order — each one builds on the last.',
        '',
        '<!-- pikku:knowledge-index -->',
        '- [Stale](99-gone.md) — no longer here',
        '<!-- /pikku:knowledge-index -->',
        '',
        'Anything below survives too.',
      ].join('\n'),
      'knowledge/milestones/01-a.md': milestone(
        'The daily entry',
        'One piece.'
      ),
    })
    await runKnowledgeIndex(root)
    const index = await read(root, 'knowledge/milestones/index.md')
    assert.match(index, /Read these in order/)
    assert.match(index, /Anything below survives too\./)
    assert.match(index, /The daily entry/)
    assert.doesNotMatch(index, /99-gone\.md/)
  })

  test('appends the block to an index that has no markers, destroying nothing', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nx',
      'knowledge/milestones/index.md':
        '---\ntype: overview\n---\n\n# Milestones\n\nHand written.\n',
      'knowledge/milestones/01-a.md': milestone('A', 'a'),
    })
    await runKnowledgeIndex(root)
    const index = await read(root, 'knowledge/milestones/index.md')
    assert.match(index, /Hand written\./)
    assert.match(index, /<!-- pikku:knowledge-index -->/)
  })

  test('is idempotent — a second run changes nothing', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nx',
      'knowledge/milestones/01-a.md': milestone('A', 'a'),
    })
    await runKnowledgeIndex(root)
    const first = await read(root, 'knowledge/milestones/index.md')
    const second = await runKnowledgeIndex(root)
    assert.deepEqual(
      second.files.map((f) => f.action),
      ['unchanged', 'unchanged']
    )
    assert.equal(await read(root, 'knowledge/milestones/index.md'), first)
  })

  test('check mode reports staleness and writes nothing', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nx',
      'knowledge/milestones/01-a.md': milestone('A', 'a'),
    })
    const result = await runKnowledgeIndex(root, true)
    assert.equal(result.ok, false)
    assert.equal(result.check, true)
    await assert.rejects(() => read(root, 'knowledge/milestones/index.md'))
  })

  test('check mode passes once the indexes are current', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nx',
      'knowledge/milestones/01-a.md': milestone('A', 'a'),
    })
    await runKnowledgeIndex(root)
    assert.equal((await runKnowledgeIndex(root, true)).ok, true)
  })

  test('falls back to the first heading, then the filename, for a note with no title', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nx',
      'knowledge/milestones/01-a.md':
        '---\ntype: milestone\n---\n# From the heading\n',
      'knowledge/milestones/02-b.md':
        '---\ntype: milestone\n---\nNo heading at all.',
    })
    await runKnowledgeIndex(root)
    const index = await read(root, 'knowledge/milestones/index.md')
    assert.match(index, /- \[From the heading\]\(01-a\.md\)/)
    assert.match(index, /- \[02-b\]\(02-b\.md\)/)
  })

  test('an index never lists itself or the log', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nx',
      'knowledge/log.md': '---\ntype: note\n---\nx',
      'knowledge/milestones/index.md': '---\ntype: overview\n---\nx',
      'knowledge/milestones/01-a.md': milestone('A', 'a'),
    })
    await runKnowledgeIndex(root)
    const index = await read(root, 'knowledge/index.md')
    assert.doesNotMatch(index, /\(index\.md\)/)
    assert.doesNotMatch(index, /log\.md/)
  })

  test('a section holding only an index says so rather than listing nothing', async () => {
    const root = await project({
      'knowledge/index.md': '---\ntype: overview\n---\nx',
      'knowledge/wishlist/index.md': '---\ntype: overview\n---\nx',
    })
    await runKnowledgeIndex(root)
    assert.match(
      await read(root, 'knowledge/wishlist/index.md'),
      /_Nothing here yet\._/
    )
  })

  test('a project with no knowledge base writes nothing', async () => {
    const root = await project({ 'package.json': '{}' })
    assert.deepEqual(await runKnowledgeIndex(root), {
      ok: true,
      check: false,
      files: [],
    })
  })
})
