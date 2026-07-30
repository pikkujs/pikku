import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  findingsForNote,
  groupNotesBySection,
  maxSeverity,
  noteFileName,
  noteMatches,
  resolveNoteLink,
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
