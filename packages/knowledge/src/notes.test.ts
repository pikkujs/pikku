import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test, type TestContext } from 'node:test'
import { parseNote, readKnowledgeNotes, resourceIds } from './notes.js'

const note = (body: string) => parseNote('knowledge/milestones/01-a.md', body)

describe('parseNote', () => {
  test('reads the scalars and leaves the body', () => {
    const parsed = note(
      [
        '---',
        'type: milestone',
        'title: The daily entry',
        'description: One buildable piece.',
        'resource: func:createEntry',
        'timestamp: 2026-07-30T10:00:00Z',
        '---',
        '',
        '# The daily entry',
        '',
        'Body text.',
      ].join('\n')
    )
    assert.equal(parsed.type, 'milestone')
    assert.equal(parsed.title, 'The daily entry')
    assert.equal(parsed.description, 'One buildable piece.')
    assert.equal(parsed.resource, 'func:createEntry')
    assert.equal(parsed.timestamp, '2026-07-30T10:00:00Z')
    assert.equal(parsed.body, '# The daily entry\n\nBody text.')
  })

  test('lowercases type and status, because every gate compares them literally', () => {
    // A title-cased `type: Milestone` read as a different type entirely, so readiness
    // gates saw zero milestones against a file that plainly was one.
    const parsed = note('---\ntype: Milestone\nstatus: Proposed\n---\nbody')
    assert.equal(parsed.type, 'milestone')
    assert.equal(parsed.status, 'proposed')
  })

  test('keeps the case of every other scalar, which is prose', () => {
    const parsed = note(
      '---\ntype: milestone\ntitle: The Daily Entry\n---\nbody'
    )
    assert.equal(parsed.title, 'The Daily Entry')
  })

  test('reads tags as a flow list, a block list, or a bare scalar', () => {
    assert.deepEqual(note('---\ntags: [a, b]\n---\nx').tags, ['a', 'b'])
    assert.deepEqual(note('---\ntags:\n  - a\n  - b\n---\nx').tags, ['a', 'b'])
    assert.deepEqual(note('---\ntags: solo\n---\nx').tags, ['solo'])
  })

  test('a block list does not swallow the keys that follow it', () => {
    const parsed = note('---\ntags:\n  - a\n  - b\ntype: entity\n---\nx')
    assert.deepEqual(parsed.tags, ['a', 'b'])
    assert.equal(parsed.type, 'entity')
  })

  test('normalises a block-list entities back to the comma form', () => {
    // Declared comma-separated but written as a YAML sequence about as often.
    // Reading only the scalar form left `entities` unset on a note that listed
    // them, and the readiness gate refused a correct file.
    const parsed = note(
      '---\ntype: milestone\nentities:\n  - entry\n  - day\n---\nx'
    )
    assert.equal(parsed.entities, 'entry, day')
  })

  test('strips quotes from values', () => {
    const parsed = note('---\ntype: "milestone"\ntitle: \'Quoted\'\n---\nx')
    assert.equal(parsed.type, 'milestone')
    assert.equal(parsed.title, 'Quoted')
  })

  test('ignores an empty value rather than storing an empty string', () => {
    assert.equal(note('---\ntype: milestone\ntitle:\n---\nx').title, undefined)
  })

  test('leaves unknown keys alone — OKF permits them and profiles add their own', () => {
    const parsed = note(
      '---\ntype: milestone\ndesign: design/a.tsx#Option B\n---\nx'
    )
    assert.equal(parsed.type, 'milestone')
    assert.equal((parsed as Record<string, unknown>).design, undefined)
  })

  test("reads a profile's own scalars when it names them", () => {
    const parsed = parseNote(
      'knowledge/milestones/01-a.md',
      '---\ntype: milestone\ndesign: design/a.tsx#Option B\nroute: /entries\n---\nx',
      ['design', 'route'] as const
    )
    assert.equal(parsed.design, 'design/a.tsx#Option B')
    assert.equal(parsed.route, '/entries')
  })

  test("a profile's scalars keep their case — only this profile's vocabularies are closed", () => {
    const parsed = parseNote(
      'knowledge/milestones/01-a.md',
      '---\ntype: MILESTONE\nscreens: DailyEntry\n---\nx',
      ['screens'] as const
    )
    assert.equal(parsed.type, 'milestone')
    assert.equal(parsed.screens, 'DailyEntry')
  })

  test('a named scalar this profile already owns is read by this profile, not overwritten', () => {
    const parsed = parseNote(
      'knowledge/milestones/01-a.md',
      '---\ntype: MILESTONE\n---\nx',
      ['type'] as const
    )
    assert.equal(parsed.type, 'milestone')
  })

  test('tolerates CRLF frontmatter', () => {
    const parsed = parseNote(
      'knowledge/a.md',
      '---\r\ntype: entity\r\n---\r\nbody'
    )
    assert.equal(parsed.type, 'entity')
    assert.equal(parsed.body, 'body')
  })

  test('a file with no frontmatter is all body and has no type', () => {
    const parsed = note('# Just prose\n')
    assert.equal(parsed.type, undefined)
    assert.equal(parsed.body, '# Just prose\n')
  })

  test('marks the reserved filenames, case-insensitively', () => {
    assert.equal(parseNote('knowledge/index.md', 'x').reserved, 'index')
    assert.equal(
      parseNote('knowledge/milestones/INDEX.md', 'x').reserved,
      'index'
    )
    assert.equal(parseNote('knowledge/log.md', 'x').reserved, 'log')
    assert.equal(
      parseNote('knowledge/milestones/01-a.md', 'x').reserved,
      undefined
    )
  })
})

describe('resourceIds', () => {
  test('splits the comma-separated list and trims', () => {
    assert.deepEqual(
      resourceIds(
        note('---\nresource: func:createEntry, table:entries\n---\nx')
      ),
      ['func:createEntry', 'table:entries']
    )
  })

  test('is empty when there is no resource', () => {
    assert.deepEqual(resourceIds(note('---\ntype: entity\n---\nx')), [])
  })
})

describe('readKnowledgeNotes', () => {
  /**
   * A bundle on disk: `{ 'relative/path.md': <contents> }`, removed when the test
   * that asked for it ends. A suite that leaves a temp tree behind on every run
   * is a slow leak in whichever machine runs it most.
   */
  const bundle = async (
    t: TestContext,
    files: Record<string, string> = {}
  ): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-knowledge-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    for (const [rel, contents] of Object.entries(files)) {
      const full = join(root, rel)
      await mkdir(join(full, '..'), { recursive: true })
      await writeFile(full, contents, 'utf8')
    }
    return root
  }

  test('is empty when the project has no knowledge directory', async (t) => {
    assert.deepEqual(await readKnowledgeNotes(await bundle(t)), [])
  })

  test('reads nested notes, path-sorted, with paths relative to the root', async (t) => {
    const root = await bundle(t, {
      'knowledge/index.md': '---\ntype: overview\n---\nroot',
      'knowledge/milestones/01-a.md': '---\ntype: milestone\n---\na',
      'knowledge/decisions/why.md': '---\ntype: decision\n---\nwhy',
    })
    assert.deepEqual(
      (await readKnowledgeNotes(root)).map((n) => n.path),
      [
        join('knowledge', 'decisions', 'why.md'),
        join('knowledge', 'index.md'),
        join('knowledge', 'milestones', '01-a.md'),
      ]
    )
  })

  test('takes markdown and text, and skips everything else', async (t) => {
    const root = await bundle(t, {
      'knowledge/a.md': '---\ntype: note\n---\na',
      'knowledge/b.markdown': '---\ntype: note\n---\nb',
      'knowledge/c.txt': '---\ntype: note\n---\nc',
      'knowledge/d.png': 'not markdown',
      'knowledge/e.ts': 'export {}',
    })
    assert.deepEqual(
      (await readKnowledgeNotes(root)).map((n) => n.path.split(/[\\/]/).pop()),
      ['a.md', 'b.markdown', 'c.txt']
    )
  })

  test('skips dotfiles and dot-directories', async (t) => {
    const root = await bundle(t, {
      'knowledge/a.md': '---\ntype: note\n---\na',
      'knowledge/.hidden.md': '---\ntype: note\n---\nhidden',
      'knowledge/.drafts/b.md': '---\ntype: note\n---\ndraft',
    })
    assert.deepEqual(
      (await readKnowledgeNotes(root)).map((n) => n.path.split(/[\\/]/).pop()),
      ['a.md']
    )
  })
})
