import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { runKnowledgeValidate } from './validate.js'

const project = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-kvalidate-'))
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(root, rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, contents, 'utf8')
  }
  return root
}

const validate = (root: string) =>
  runKnowledgeValidate(root, join(root, '.pikku'))

const ids = (findings: { id: string }[]) => findings.map((f) => f.id)

const SLICE = [
  '---',
  'type: slice',
  'status: proposed',
  'entities: entry',
  '---',
  '',
  '```gherkin',
  "Given 'owner' has no entry for today",
  "When 'owner' writes one",
  'Then it appears on the day',
  '```',
].join('\n')

/** The smallest bundle that should produce no findings at all. */
const CLEAN = {
  'knowledge/index.md': '---\ntype: overview\n---\nThe app.',
  'knowledge/slices/index.md': '---\ntype: overview\n---\nBuildable pieces.',
  'knowledge/slices/01-the-daily-entry.md': SLICE,
}

describe('runKnowledgeValidate', () => {
  test('a well-formed bundle produces no findings', async () => {
    const result = await validate(await project(CLEAN))
    assert.deepEqual(result.findings, [])
    assert.equal(result.ok, true)
    assert.equal(result.notes, 3)
  })

  test('an absent knowledge base is info, not a failure', async () => {
    // Nothing is wrong with a project that has not started writing notes; failing
    // here would make the command useless as a gate on day one.
    const result = await validate(await project({ 'package.json': '{}' }))
    assert.equal(result.ok, true)
    assert.deepEqual(ids(result.findings), ['knowledge-empty'])
    assert.equal(result.findings[0]!.severity, 'info')
  })

  test('a bundle with no index.md has no entry point', async () => {
    const result = await validate(
      await project({
        'knowledge/slices/index.md': '---\ntype: overview\n---\nx',
        'knowledge/slices/01-a.md': SLICE,
      })
    )
    assert.ok(ids(result.findings).includes('knowledge-no-index'))
    assert.equal(result.ok, false)
  })

  test('a section without its own index.md warns but does not fail', async () => {
    const result = await validate(
      await project({
        'knowledge/index.md': '---\ntype: overview\n---\nx',
        'knowledge/slices/01-a.md': SLICE,
      })
    )
    assert.deepEqual(ids(result.findings), [
      'knowledge-section-no-index-slices',
    ])
    assert.equal(result.findings[0]!.severity, 'warn')
    assert.equal(result.ok, true)
  })

  test('a nested section is its own section, not its parent', async () => {
    const result = await validate(
      await project({
        ...CLEAN,
        'knowledge/decisions/index.md': '---\ntype: overview\n---\nx',
        'knowledge/decisions/security/one-account.md':
          '---\ntype: decision\n---\nx',
      })
    )
    assert.deepEqual(ids(result.findings), [
      'knowledge-section-no-index-decisions-security',
    ])
  })

  test('a parent holding only sub-sections still needs an index', async () => {
    // Without this, `decisions/` is the one directory in the bundle nothing
    // points into — the root maps sections, and it never became one.
    const result = await validate(
      await project({
        ...CLEAN,
        'knowledge/decisions/security/index.md': '---\ntype: overview\n---\nx',
        'knowledge/decisions/security/one-account.md':
          '---\ntype: decision\n---\nx',
      })
    )
    assert.deepEqual(ids(result.findings), [
      'knowledge-section-no-index-decisions',
    ])
    assert.equal(result.findings[0]!.severity, 'warn')
  })

  test('a note with no type fails — it is the one field OKF requires', async () => {
    const result = await validate(
      await project({
        ...CLEAN,
        'knowledge/entities/index.md': '---\ntype: overview\n---\nx',
        'knowledge/entities/entry.md': '# Entry\n\nA day of writing.',
      })
    )
    assert.ok(
      ids(result.findings).some((id) => id.startsWith('knowledge-no-type-'))
    )
    assert.equal(result.ok, false)
  })

  test('a flat note at the root is a document, not a knowledge base', async () => {
    const result = await validate(
      await project({
        ...CLEAN,
        'knowledge/product.md': '---\ntype: note\n---\nx',
      })
    )
    assert.deepEqual(ids(result.findings), ['knowledge-flat-note-product.md'])
    assert.equal(result.findings[0]!.severity, 'warn')
  })

  test('log.md at the root is reserved, not a flat note', async () => {
    const result = await validate(
      await project({ ...CLEAN, 'knowledge/log.md': '---\ntype: note\n---\nx' })
    )
    assert.deepEqual(result.findings, [])
  })

  test('a section duplicating what the project already declares fails', async () => {
    // personas live in `definePersonas()`; a note copying one drifts the moment
    // someone edits the declaration, and the note is the copy that looks
    // authoritative.
    const result = await validate(
      await project({
        ...CLEAN,
        'knowledge/personas/index.md': '---\ntype: overview\n---\nx',
        'knowledge/personas/owner.md': '---\ntype: note\n---\nx',
      })
    )
    assert.deepEqual(ids(result.findings), [
      'knowledge-forbidden-section-personas',
    ])
    assert.equal(result.ok, false)
    assert.match(result.findings[0]!.fixHint, /definePersonas/)
  })

  test('a forbidden section with a sub-section is reported once, not per level', async () => {
    // The finding is about the directory, and deleting it takes the sub-sections
    // with it. Reporting each level put the same id in the list twice, which
    // reads as two problems and offers no way to tell them apart.
    const result = await validate(
      await project({
        ...CLEAN,
        'knowledge/personas/index.md': '---\ntype: overview\n---\nx',
        'knowledge/personas/owner.md': '---\ntype: note\n---\nx',
        'knowledge/personas/admin/index.md': '---\ntype: overview\n---\nx',
        'knowledge/personas/admin/root.md': '---\ntype: note\n---\nx',
      })
    )
    assert.deepEqual(ids(result.findings), [
      'knowledge-forbidden-section-personas',
    ])
  })

  test('names the right home for each forbidden section', async () => {
    const result = await validate(
      await project({
        ...CLEAN,
        'knowledge/scenarios/index.md': '---\ntype: overview\n---\nx',
        'knowledge/permissions/index.md': '---\ntype: overview\n---\nx',
      })
    )
    assert.deepEqual(ids(result.findings).sort(), [
      'knowledge-forbidden-section-permissions',
      'knowledge-forbidden-section-scenarios',
    ])
  })
})

describe('runKnowledgeValidate on slices', () => {
  const withSlice = async (body: string) =>
    validate(
      await project({
        'knowledge/index.md': '---\ntype: overview\n---\nx',
        'knowledge/slices/index.md': '---\ntype: overview\n---\nx',
        'knowledge/slices/01-a.md': body,
      })
    )

  test('a slice with no status cannot be gated on', async () => {
    const result = await withSlice(SLICE.replace('status: proposed\n', ''))
    assert.ok(
      ids(result.findings).some((id) =>
        id.startsWith('knowledge-slice-no-status-')
      )
    )
  })

  test('a status outside the vocabulary fails, because gates compare it literally', async () => {
    const result = await withSlice(
      SLICE.replace('status: proposed', 'status: in-progress')
    )
    assert.ok(
      ids(result.findings).some((id) =>
        id.startsWith('knowledge-slice-bad-status-')
      )
    )
  })

  test('a title-cased status still passes, because the parser lowercases it', async () => {
    const result = await withSlice(
      SLICE.replace('status: proposed', 'status: Built')
    )
    assert.deepEqual(result.findings, [])
  })

  test('a slice naming no entities warns — its size cannot be judged', async () => {
    const result = await withSlice(SLICE.replace('entities: entry\n', ''))
    assert.ok(
      ids(result.findings).some((id) =>
        id.startsWith('knowledge-slice-no-entities-')
      )
    )
    assert.equal(result.ok, true)
  })

  test('a slice touching more than three entities is not one buildable piece', async () => {
    const result = await withSlice(
      SLICE.replace('entities: entry', 'entities: entry, day, user, grant')
    )
    assert.ok(
      ids(result.findings).some((id) =>
        id.startsWith('knowledge-slice-too-big-')
      )
    )
    assert.equal(result.ok, false)
  })

  test('a slice with no gherkin block has nothing to verify against', async () => {
    const result = await withSlice(
      '---\ntype: slice\nstatus: proposed\nentities: entry\n---\n\nJust prose.'
    )
    assert.ok(
      ids(result.findings).some((id) =>
        id.startsWith('knowledge-slice-no-scenario-')
      )
    )
  })

  test('a first-person scenario hides who is acting', async () => {
    const result = await withSlice(
      SLICE.replace(
        "Given 'owner' has no entry for today",
        'Given I have no entry'
      )
    )
    assert.ok(
      ids(result.findings).some((id) =>
        id.startsWith('knowledge-slice-first-person-')
      )
    )
    assert.equal(result.ok, false)
  })

  test('a quoted persona named Ida is not the pronoun I', async () => {
    const result = await withSlice(
      SLICE.replace("Given 'owner'", "Given 'ida'")
    )
    assert.deepEqual(result.findings, [])
  })

  test('only slices are held to the slice rules', async () => {
    const result = await validate(
      await project({
        'knowledge/index.md': '---\ntype: overview\n---\nx',
        'knowledge/entities/index.md': '---\ntype: overview\n---\nx',
        'knowledge/entities/entry.md':
          '---\ntype: entity\n---\nA day of writing.',
      })
    )
    assert.deepEqual(result.findings, [])
  })
})

describe('runKnowledgeValidate on resources', () => {
  test('a dangling resource is reported as an error against the note', async () => {
    const root = await project({
      ...CLEAN,
      '.pikku/function/pikku-functions-meta.gen.json': '{"createEntry":{}}',
      'knowledge/slices/02-b.md': SLICE.replace(
        'entities: entry',
        'entities: entry\nresource: func:gone'
      ),
    })
    const result = await validate(root)
    assert.ok(
      ids(result.findings).some((id) =>
        id.startsWith('knowledge-resource-dangling-')
      )
    )
    assert.equal(result.ok, false)
  })

  test('two notes with the same dangling resource are two findings', async () => {
    // Each note is its own thing to fix, so each needs an id something can key
    // on — an id built from the uri alone made the second finding a duplicate of
    // the first.
    const dangling = SLICE.replace(
      'entities: entry',
      'entities: entry\nresource: func:gone'
    )
    const root = await project({
      ...CLEAN,
      '.pikku/function/pikku-functions-meta.gen.json': '{"createEntry":{}}',
      'knowledge/slices/02-b.md': dangling,
      'knowledge/slices/03-c.md': dangling,
    })
    const resourceIds = ids((await validate(root)).findings).filter((id) =>
      id.startsWith('knowledge-resource-')
    )
    assert.equal(resourceIds.length, 2)
    assert.equal(new Set(resourceIds).size, 2)
  })

  test('a resolving resource adds no finding', async () => {
    const root = await project({
      ...CLEAN,
      '.pikku/function/pikku-functions-meta.gen.json': '{"createEntry":{}}',
      'knowledge/slices/02-b.md': SLICE.replace(
        'entities: entry',
        'entities: entry\nresource: func:createEntry'
      ),
    })
    assert.deepEqual((await validate(root)).findings, [])
  })
})
