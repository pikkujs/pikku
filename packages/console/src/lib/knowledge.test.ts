import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  bodyWithoutTitle,
  entryPointNote,
  findingsForNote,
  groupNotesBySection,
  maxSeverity,
  noteFileName,
  noteMatches,
  parseResourceUri,
  readableBody,
  resourceHref,
  resolveNoteLink,
  toNavSections,
  type KnowledgeFinding,
  type KnowledgeNote,
} from './knowledge.js'

const note = (
  over: Partial<KnowledgeNote> & { path: string }
): KnowledgeNote => ({
  section: '',
  title: 'Untitled',
  tags: [],
  resource: [],
  entities: [],
  body: '',
  outbound: [],
  inbound: [],
  dangling: [],
  ...over,
})

const finding = (
  over: Partial<KnowledgeFinding> & { id: string }
): KnowledgeFinding => ({
  severity: 'error',
  message: 'broken',
  path: 'knowledge/index.md',
  fixHint: 'fix it',
  ...over,
})

describe('noteFileName', () => {
  test('reduces a path to the file a listing shows', () => {
    assert.equal(noteFileName('knowledge/decisions/why.md'), 'why.md')
    assert.equal(noteFileName('index.md'), 'index.md')
  })
})

describe('noteMatches', () => {
  const subject = note({
    path: 'knowledge/slices/01-day-entry.md',
    title: 'Log a day',
    description: 'The owner writes what happened',
    type: 'slice',
    tags: ['day'],
    resource: ['func:createEntry'],
    body: "Given 'owner' has an entry for today",
  })

  test('an empty query matches everything', () => {
    assert.equal(noteMatches(subject, ''), true)
    assert.equal(noteMatches(subject, '   '), true)
  })

  test('matches the body, not just the title', () => {
    assert.equal(noteMatches(subject, 'has an entry'), true)
  })

  test('matches the path, the type, a tag and a resource', () => {
    assert.equal(noteMatches(subject, '01-day'), true)
    assert.equal(noteMatches(subject, 'slice'), true)
    assert.equal(noteMatches(subject, 'day'), true)
    assert.equal(noteMatches(subject, 'createentry'), true)
  })

  test('reports a miss', () => {
    assert.equal(noteMatches(subject, 'invoice'), false)
  })
})

describe('maxSeverity', () => {
  test('an error outranks a warning', () => {
    assert.equal(
      maxSeverity([
        finding({ id: 'a', severity: 'warn' }),
        finding({ id: 'b', severity: 'error' }),
      ]),
      'error'
    )
  })

  test('nothing to report reads as info', () => {
    assert.equal(maxSeverity([]), 'info')
  })
})

describe('findingsForNote', () => {
  test('keeps only the findings pointing at that note', () => {
    const findings = [
      finding({ id: 'a', path: 'knowledge/index.md' }),
      finding({ id: 'b', path: 'knowledge/slices/01.md' }),
    ]
    assert.deepEqual(
      findingsForNote(findings, 'knowledge/slices/01.md').map((f) => f.id),
      ['b']
    )
  })
})

describe('resolveNoteLink', () => {
  const from = 'knowledge/slices/01-day-entry.md'

  test('resolves a sibling and a parent-relative link', () => {
    assert.equal(
      resolveNoteLink(from, '02-next.md'),
      'knowledge/slices/02-next.md'
    )
    assert.equal(
      resolveNoteLink(from, '../decisions/why.md'),
      'knowledge/decisions/why.md'
    )
    assert.equal(
      resolveNoteLink(from, './index.md'),
      'knowledge/slices/index.md'
    )
  })

  test('a root-absolute link is read as bundle-relative', () => {
    assert.equal(
      resolveNoteLink(from, '/knowledge/index.md'),
      'knowledge/index.md'
    )
  })

  test('an anchor on a note link is dropped', () => {
    assert.equal(
      resolveNoteLink(from, '../decisions/why.md#the-rule'),
      'knowledge/decisions/why.md'
    )
  })

  test('is null for anything that is not a note', () => {
    assert.equal(resolveNoteLink(from, 'https://pikku.dev'), null)
    assert.equal(resolveNoteLink(from, 'mailto:a@b.c'), null)
    assert.equal(resolveNoteLink(from, '#the-rule'), null)
    assert.equal(resolveNoteLink(from, '../src/entry.ts'), null)
  })

  test('a link that climbs past the repo root is not clamped back inside it', () => {
    // Popping an empty stack would clamp `../../../../elsewhere.md` to
    // `elsewhere.md` — a different file, and one that may well exist. The graph
    // normalises the same link to a path starting `../`, which matches no note
    // either, so both sides agree it is not an edge.
    assert.equal(resolveNoteLink(from, '../../../elsewhere.md'), null)
    assert.equal(
      resolveNoteLink('knowledge/index.md', '../elsewhere.md'),
      'elsewhere.md',
      'still inside the repo, so it resolves — and resolves to no note'
    )
  })
})

describe('bodyWithoutTitle', () => {
  test('drops the opening heading that repeats the title', () => {
    assert.equal(
      bodyWithoutTitle(
        '# Read a report\n\nThe narrowest slice.\n',
        'Read a report'
      ),
      'The narrowest slice.\n'
    )
  })

  test('matches the title however it was cased or spaced', () => {
    assert.equal(
      bodyWithoutTitle('#  read A report  \nbody', 'Read a report'),
      'body'
    )
  })

  test('keeps an opening heading that says something else', () => {
    const body = '# The rule\n\nprose'
    assert.equal(bodyWithoutTitle(body, 'Read a report'), body)
  })

  test('keeps a matching heading that is not the opening one', () => {
    // A note may well have a section named after itself further down; only the
    // heading the page already shows is the duplicate.
    const body = 'prose\n\n# Read a report\n\nmore'
    assert.equal(bodyWithoutTitle(body, 'Read a report'), body)
  })
})

describe('toNavSections', () => {
  const groups = [
    {
      section: '',
      notes: [
        note({ path: 'knowledge/index.md', section: '', reserved: 'index' }),
      ],
    },
    {
      section: 'decisions/security',
      description: 'a rule about who may do what',
      notes: [
        note({
          path: 'knowledge/decisions/security/a.md',
          section: 'decisions/security',
          title: 'A rule',
        }),
        note({
          path: 'knowledge/decisions/security/index.md',
          section: 'decisions/security',
          reserved: 'index',
        }),
      ],
    },
  ]

  test("the section's own index becomes the header, not a row beside its notes", () => {
    const security = toNavSections(groups)[1]!
    assert.equal(security.indexPath, 'knowledge/decisions/security/index.md')
    assert.deepEqual(
      security.notes.map((n) => n.path),
      ['knowledge/decisions/security/a.md']
    )
  })

  test('the label is the last segment, since the parent is directly above it', () => {
    assert.equal(toNavSections(groups)[1]!.label, 'security')
  })

  test('depth is how far the section nests, and the root sits at zero', () => {
    assert.deepEqual(
      toNavSections(groups).map((section) => section.depth),
      [0, 1]
    )
  })

  test('a section with no index of its own has no header to open', () => {
    const [section] = toNavSections([
      {
        section: 'wishlist',
        notes: [note({ path: 'knowledge/wishlist/a.md', section: 'wishlist' })],
      },
    ])
    assert.equal(section!.indexPath, undefined)
    assert.equal(section!.notes.length, 1)
  })
})

describe('groupNotesBySection', () => {
  const bundle = {
    notes: [
      note({ path: 'knowledge/index.md', section: '' }),
      note({ path: 'knowledge/decisions/index.md', section: 'decisions' }),
      note({ path: 'knowledge/slices/01.md', section: 'slices' }),
    ],
    sections: [
      { name: 'decisions', description: 'a rule that was chosen', count: 1 },
      { name: 'slices', count: 1 },
    ],
  }

  test('the root comes first, then the sections in bundle order', () => {
    assert.deepEqual(
      groupNotesBySection(bundle).map((group) => group.section),
      ['', 'decisions', 'slices']
    )
  })

  test('carries the section description through', () => {
    const decisions = groupNotesBySection(bundle).find(
      (group) => group.section === 'decisions'
    )
    assert.equal(decisions?.description, 'a rule that was chosen')
  })

  test('a section with no notes left after a filter is dropped', () => {
    const filtered = groupNotesBySection({
      notes: bundle.notes.filter((n) => n.section === 'slices'),
      sections: bundle.sections,
    })
    assert.deepEqual(
      filtered.map((group) => group.section),
      ['slices']
    )
  })

  test('a section the bundle did not report is still listed', () => {
    const grouped = groupNotesBySection({
      notes: [note({ path: 'knowledge/wishlist/a.md', section: 'wishlist' })],
      sections: [],
    })
    assert.deepEqual(
      grouped.map((group) => group.section),
      ['wishlist']
    )
  })
})

describe('readableBody', () => {
  test('removes the markers pikku knowledge index wraps its listing in', () => {
    // Without raw-HTML rendering a comment arrives as a text node and is drawn
    // on the page — the one place these markers must never appear.
    const body = [
      '# Decisions',
      '',
      '<!-- pikku:knowledge-index -->',
      '- [security](security/index.md) — a rule about who may do what',
      '<!-- /pikku:knowledge-index -->',
      '',
    ].join('\n')
    const readable = readableBody(body)
    assert.ok(!readable.includes('<!--'), readable)
    assert.ok(
      readable.includes('- [security](security/index.md)'),
      'the listing itself is content and stays'
    )
  })

  test('a comment inside a fence is being shown on purpose', () => {
    const body = '```html\n<!-- keep me -->\n```'
    assert.equal(readableBody(body), body)
  })

  test('a multi-line comment goes entirely', () => {
    assert.equal(readableBody('a\n\n<!--\nnote to self\n-->\n\nb'), 'a\n\nb')
  })

  test('a body with no comments is untouched', () => {
    const body = '# Title\n\nSome prose with a < and an -- in it.\n'
    assert.equal(readableBody(body), body)
  })
})

describe('entryPointNote', () => {
  const entry = note({
    path: 'knowledge/index.md',
    section: '',
    reserved: 'index',
  })
  const decision = note({
    path: 'knowledge/decisions/index.md',
    section: 'decisions',
    reserved: 'index',
  })

  test('lands on the root index rather than whatever sorts first', () => {
    // Path order opens `decisions/index.md`, which is a section index, not the
    // note written to be read first.
    assert.equal(entryPointNote([decision, entry])?.path, 'knowledge/index.md')
  })

  test('a section index is not mistaken for the entry point', () => {
    assert.equal(
      entryPointNote([decision])?.path,
      'knowledge/decisions/index.md',
      'with no root index the first note is still better than nothing'
    )
  })

  test('an empty list has no entry point', () => {
    assert.equal(entryPointNote([]), undefined)
  })
})

describe('resource URIs', () => {
  test('splits a URI at the first colon', () => {
    assert.deepEqual(parseResourceUri('func:createEntry'), {
      prefix: 'func',
      id: 'createEntry',
    })
  })

  test('a scope id keeps the colons inside it', () => {
    assert.deepEqual(parseResourceUri('scope:entry:write'), {
      prefix: 'scope',
      id: 'entry:write',
    })
  })

  test('an unknown prefix is not a resource', () => {
    assert.equal(parseResourceUri('https://pikku.dev'), null)
    assert.equal(parseResourceUri('mailto:hi@example.com'), null)
    assert.equal(parseResourceUri('entities/entry.md'), null)
    assert.equal(parseResourceUri('func:'), null)
  })

  test('a function leads to the functions screen, filtered to it', () => {
    assert.equal(
      resourceHref('func:createEntry'),
      '/functions?search=createEntry'
    )
  })

  test('an id that is not URL-safe survives the trip', () => {
    assert.equal(
      resourceHref('http:/entries/:id'),
      '/apis?tab=http&search=%2Fentries%2F%3Aid'
    )
  })

  test('a kind with no screen has no link', () => {
    assert.equal(resourceHref('schema:CreateEntryInput'), null)
    assert.equal(resourceHref('nonsense:whatever'), null)
  })

  test('a kind whose screen has no query still opens the screen', () => {
    assert.equal(resourceHref('persona:owner'), '/personas')
    assert.equal(resourceHref('table:entry'), '/database')
  })
})
