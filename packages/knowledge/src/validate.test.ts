import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { basePlan } from './plan-fixture.js'
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

const NOTE = ['---', 'type: entity', 'title: Entry', '---', '', 'A day of writing.'].join('\n')

const withResource = (resource: string) =>
  NOTE.replace('title: Entry', `title: Entry\nresource: ${resource}`)

/** The smallest bundle that should produce no findings at all. */
const CLEAN = {
  'knowledge/index.md': '---\ntype: overview\n---\nThe app.',
  'knowledge/entities/index.md': '---\ntype: overview\n---\nThings.',
  'knowledge/entities/entry.md': NOTE,
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
        'knowledge/entities/index.md': '---\ntype: overview\n---\nx',
        'knowledge/entities/01-a.md': NOTE,
      })
    )
    assert.ok(ids(result.findings).includes('knowledge-no-index'))
    assert.equal(result.ok, false)
  })

  test('a section without its own index.md warns but does not fail', async () => {
    const result = await validate(
      await project({
        'knowledge/index.md': '---\ntype: overview\n---\nx',
        'knowledge/entities/01-a.md': NOTE,
      })
    )
    assert.deepEqual(ids(result.findings), [
      'knowledge-section-no-index-entities',
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

describe('runKnowledgeValidate on resources', () => {
  test('a dangling resource is reported as an error against the note', async () => {
    const root = await project({
      ...CLEAN,
      '.pikku/function/pikku-functions-meta.gen.json': '{"createEntry":{}}',
      'knowledge/entities/02-b.md': withResource('func:gone'),
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
    const dangling = withResource('func:gone')
    const root = await project({
      ...CLEAN,
      '.pikku/function/pikku-functions-meta.gen.json': '{"createEntry":{}}',
      'knowledge/entities/02-b.md': dangling,
      'knowledge/entities/03-c.md': dangling,
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
      'knowledge/entities/02-b.md': withResource('func:createEntry'),
    })
    assert.deepEqual((await validate(root)).findings, [])
  })
})

describe('runKnowledgeValidate on decisions', () => {
  const decisionNote = (body: string) =>
    ['---', 'type: decision', '---', '', body].join('\n')

  const withDecisions = (body: string) => ({
    ...CLEAN,
    'knowledge/decisions/index.md': '---\ntype: overview\n---\nRules chosen.',
    'knowledge/decisions/revocation.md': decisionNote(body),
  })

  test('a decision argued in prose is not a finding', async () => {
    // The fence is optional by design: requiring one would be a finding against
    // every decision note written before it existed.
    const root = await project(
      withDecisions(
        'Revoking ends the grant at once. We rejected a grace period.'
      )
    )
    assert.deepEqual((await validate(root)).findings, [])
  })

  test('a complete decision fence is not a finding', async () => {
    const root = await project(
      withDecisions(
        '```decision\nchosen: Revocation is immediate\nrules-out: A grace period until midnight\nbecause: Two people disagreeing about access is worse\n```'
      )
    )
    assert.deepEqual((await validate(root)).findings, [])
  })

  test('a fence that rules nothing out warns', async () => {
    const root = await project(
      withDecisions('```decision\nchosen: Revocation is immediate\n```')
    )
    const result = await validate(root)
    assert.deepEqual(ids(result.findings), [
      'knowledge-decision-nothing-ruled-out-knowledge/decisions/revocation.md-1',
    ])
    // A warning, not an error: the note is incomplete rather than wrong, and it
    // must not fail the command a project gates CI on.
    assert.equal(result.findings[0]!.severity, 'warn')
    assert.equal(result.ok, true)
  })

  test('a fence with no chosen warns that it will render as code', async () => {
    const root = await project(
      withDecisions('```decision\nwe went with postgres\n```')
    )
    const result = await validate(root)
    assert.deepEqual(ids(result.findings), [
      'knowledge-decision-fence-unparsed-knowledge/decisions/revocation.md-1',
    ])
    assert.equal(result.ok, true)
  })

  test('two bad fences in one note are two findings, not one', async () => {
    // Each finding is addressed by its id, so two sharing one would hide the
    // second fence from anything that looks a finding up rather than counting.
    const root = await project(
      withDecisions(
        [
          '```decision',
          'chosen: Revocation is immediate',
          '```',
          '',
          'And later in the same note:',
          '',
          '```decision',
          'chosen: Grants are checked per request',
          '```',
        ].join('\n')
      )
    )
    const result = await validate(root)
    assert.deepEqual(ids(result.findings), [
      'knowledge-decision-nothing-ruled-out-knowledge/decisions/revocation.md-1',
      'knowledge-decision-nothing-ruled-out-knowledge/decisions/revocation.md-2',
    ])
    assert.equal(new Set(ids(result.findings)).size, 2)
  })

  test('an entity may state a decision too', async () => {
    const root = await project({
      ...CLEAN,
      'knowledge/entities/02-b.md': `${NOTE}\n\n\`\`\`decision\nchosen: One entry per day\n\`\`\``,
    })
    assert.deepEqual(ids((await validate(root)).findings), [
      'knowledge-decision-nothing-ruled-out-knowledge/entities/02-b.md-1',
    ])
  })

  // What landed is checked against codegen when the changeset merges; here a plan is
  // only held to what can be decided from the plan itself.
  describe('plans', () => {
    const PLAN_PATH = 'knowledge/plans/the-daily-entry.plan.json'

    test('a plan that holds adds no finding', async () => {
      const result = await validate(
        await project({ ...CLEAN, [PLAN_PATH]: JSON.stringify(basePlan()) })
      )
      assert.deepEqual(ids(result.findings), [])
    })

    test('a plan that does not parse is an error against the plan file', async () => {
      const result = await validate(
        await project({ ...CLEAN, [PLAN_PATH]: '{"version": 1}' })
      )
      assert.equal(result.ok, false)
      assert.deepEqual(ids(result.findings), [
        `knowledge-plan-unreadable-${PLAN_PATH}`,
      ])
      assert.equal(result.findings[0]!.path, PLAN_PATH)
    })
  })
})
