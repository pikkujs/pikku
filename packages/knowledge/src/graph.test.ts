import assert from 'node:assert'
import { describe, test } from 'node:test'
import { buildKnowledgeGraph, outboundLinks } from './graph.js'
import { parseNote } from './notes.js'

const note = (path: string, raw: string) => parseNote(path, raw)

const find = (graph: ReturnType<typeof buildKnowledgeGraph>, path: string) => {
  const found = graph.notes.find((n) => n.path === path)
  assert.ok(found, `expected a note at ${path}`)
  return found
}

describe('outboundLinks', () => {
  test('resolves a relative link against the linking note directory', () => {
    assert.deepEqual(
      outboundLinks(
        note(
          'knowledge/slices/01-a.md',
          '---\ntype: slice\n---\nSee [why](../decisions/why.md).'
        )
      ),
      ['knowledge/decisions/why.md']
    )
  })

  test('drops the anchor but keeps the note', () => {
    assert.deepEqual(
      outboundLinks(
        note(
          'knowledge/index.md',
          '---\ntype: overview\n---\n[a](slices/01-a.md#top)'
        )
      ),
      ['knowledge/slices/01-a.md']
    )
  })

  test('ignores links that are not to a note', () => {
    // The graph is of notes. A link to a source file or a website is prose that
    // happens to be clickable, and counting it would put uncrossable edges in.
    assert.deepEqual(
      outboundLinks(
        note(
          'knowledge/index.md',
          [
            '---',
            'type: overview',
            '---',
            '[site](https://pikku.dev)',
            '[code](../src/functions/create-entry.ts)',
            '[anchor](#section)',
            '[mail](mailto:a@b.c)',
          ].join('\n')
        )
      ),
      []
    )
  })

  test('does not read links out of a fenced block', () => {
    // A slice body is mostly gherkin, and decisions quote paths. Bracket-and-paren
    // text in there is not a link a reader can click.
    assert.deepEqual(
      outboundLinks(
        note(
          'knowledge/slices/01-a.md',
          [
            '---',
            'type: slice',
            '---',
            '```gherkin',
            "Given 'owner' opens [the day](../decisions/why.md)",
            '```',
            'And inline `[x](../decisions/other.md)` too.',
          ].join('\n')
        )
      ),
      []
    )
  })

  test('de-duplicates repeated links to the same note', () => {
    assert.deepEqual(
      outboundLinks(
        note(
          'knowledge/index.md',
          '---\ntype: overview\n---\n[a](slices/01-a.md) and [again](slices/01-a.md)'
        )
      ),
      ['knowledge/slices/01-a.md']
    )
  })
})

describe('buildKnowledgeGraph', () => {
  const bundle = () => [
    note(
      'knowledge/index.md',
      '---\ntype: overview\ntitle: Knowledge\n---\n[slices](slices/index.md)'
    ),
    note('knowledge/slices/index.md', '---\ntype: overview\n---\nPieces.'),
    note(
      'knowledge/slices/01-a.md',
      [
        '---',
        'type: slice',
        'title: The daily entry',
        'description: One piece.',
        'status: proposed',
        'entities: entry, day',
        'resource: func:createEntry, table:entry',
        'tags: [writing, daily]',
        '---',
        'Governed by [revocation](../decisions/why.md) and [nothing yet](../decisions/later.md).',
      ].join('\n')
    ),
    note(
      'knowledge/decisions/why.md',
      '---\ntype: decision\ntags: [writing]\n---\n# Why\n\nBecause.'
    ),
  ]

  test('records both directions of every link', () => {
    // Inbound is the half a markdown file cannot express: a note has no way to
    // say what points at it, and that is exactly what a reader wants to know.
    const graph = buildKnowledgeGraph(bundle())
    assert.deepEqual(find(graph, 'knowledge/slices/01-a.md').outbound, [
      'knowledge/decisions/why.md',
    ])
    assert.deepEqual(find(graph, 'knowledge/decisions/why.md').inbound, [
      'knowledge/slices/01-a.md',
    ])
  })

  test('separates a dangling link from a real edge without treating it as an error', () => {
    // OKF permits it: a link to a note nobody has written marks something worth
    // writing. It is surfaced, not failed.
    const graph = buildKnowledgeGraph(bundle())
    assert.deepEqual(find(graph, 'knowledge/slices/01-a.md').dangling, [
      'knowledge/decisions/later.md',
    ])
    assert.equal(graph.stats.dangling, 1)
    assert.equal(graph.stats.links, 2)
  })

  test('splits resource: and entities so a reader gets lists, not strings', () => {
    const slice = find(
      buildKnowledgeGraph(bundle()),
      'knowledge/slices/01-a.md'
    )
    assert.deepEqual(slice.resource, ['func:createEntry', 'table:entry'])
    assert.deepEqual(slice.entities, ['entry', 'day'])
  })

  test('counts sections without counting their own index.md', () => {
    const graph = buildKnowledgeGraph(bundle())
    assert.deepEqual(graph.sections, [
      {
        name: 'slices',
        description:
          'one buildable piece of the app, with the scenario that proves it',
        count: 1,
      },
      {
        name: 'decisions',
        description: 'a rule that was chosen, and what it rules out',
        count: 1,
      },
    ])
  })

  test('orders sections the way the profile declares them, not alphabetically', () => {
    // Alphabetical leads with `decisions` and buries `slices` last, which is the
    // reverse of how a base is read: the slice first, then what governs it.
    const graph = buildKnowledgeGraph([
      note('knowledge/questions/open.md', '---\ntype: question\n---\nq'),
      note('knowledge/decisions/why.md', '---\ntype: decision\n---\nd'),
      note('knowledge/entities/entry.md', '---\ntype: entity\n---\ne'),
      note('knowledge/slices/01-a.md', '---\ntype: slice\n---\ns'),
    ])
    assert.deepEqual(
      graph.sections.map((section) => section.name),
      ['slices', 'entities', 'decisions', 'questions']
    )
  })

  test('a section not in the profile sorts after the ones that are', () => {
    const graph = buildKnowledgeGraph([
      note('knowledge/archive/old.md', '---\ntype: note\n---\na'),
      note('knowledge/slices/01-a.md', '---\ntype: slice\n---\ns'),
    ])
    assert.deepEqual(
      graph.sections.map((section) => section.name),
      ['slices', 'archive']
    )
  })

  test('a section holding only sub-sections is still listed, at count zero', () => {
    // `decisions/` with nothing but `decisions/security/` under it: it has no
    // notes of its own, and dropping it would hide the parent of a section that
    // is itself shown.
    const graph = buildKnowledgeGraph([
      note(
        'knowledge/decisions/security/who-reads.md',
        '---\ntype: decision\n---\nd'
      ),
    ])
    assert.deepEqual(graph.sections, [
      {
        name: 'decisions',
        description: 'a rule that was chosen, and what it rules out',
        count: 0,
      },
      {
        name: 'decisions/security',
        description: 'a rule about who may do what',
        count: 1,
      },
    ])
  })

  test('counts tags across notes', () => {
    assert.deepEqual(buildKnowledgeGraph(bundle()).tagCounts, {
      writing: 2,
      daily: 1,
    })
  })

  test('falls back to the first heading for a note with no title', () => {
    assert.equal(
      find(buildKnowledgeGraph(bundle()), 'knowledge/decisions/why.md').title,
      'Why'
    )
  })

  test('falls back to the filename when there is no heading either', () => {
    const graph = buildKnowledgeGraph([
      note(
        'knowledge/questions/who-owns-a-shared-day.md',
        '---\ntype: note\n---\nx'
      ),
    ])
    assert.equal(
      find(graph, 'knowledge/questions/who-owns-a-shared-day.md').title,
      'who-owns-a-shared-day'
    )
  })

  test('an empty bundle produces an empty graph rather than throwing', () => {
    assert.deepEqual(buildKnowledgeGraph([]), {
      notes: [],
      sections: [],
      tagCounts: {},
      stats: { notes: 0, sections: 0, links: 0, dangling: 0 },
    })
  })
})
