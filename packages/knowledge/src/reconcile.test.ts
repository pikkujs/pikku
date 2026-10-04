import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { noteHash } from './notes.js'
import { basePlan } from './plan-fixture.js'
import { knowledgeLine, runKnowledgeGaps } from './reconcile.js'

const project = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-gaps-'))
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(root, rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, contents, 'utf8')
  }
  return root
}

const ENTRY = '---\ntype: entity\n---\nentry body'
const BASE = {
  'knowledge/index.md': '---\ntype: overview\n---\nThe app.',
  'knowledge/entities/entry.md': ENTRY,
  'knowledge/questions/who.md': '---\ntype: question\n---\nWho signs in?',
}

describe('runKnowledgeGaps', () => {
  test('a note nobody planned is a gap; questions and indexes are not', async () => {
    const { gaps } = await runKnowledgeGaps(await project(BASE))
    assert.deepEqual(
      gaps.map((gap) => [gap.note, gap.state]),
      [['knowledge/entities/entry.md', 'uncovered']]
    )
  })

  test('a gap already filed as a change is not filed again', async () => {
    const root = await project(BASE)
    const [gap] = (await runKnowledgeGaps(root)).gaps
    const { gaps } = await runKnowledgeGaps(root, {
      filed: [`Build the entry.\n\n${knowledgeLine(gap!)}`],
    })
    assert.deepEqual(gaps, [])
  })

  test('an edit to a filed note brings it back', async () => {
    const root = await project(BASE)
    const filed = [knowledgeLine({ note: 'knowledge/entities/entry.md', hash: noteHash('old body') })]
    const { gaps } = await runKnowledgeGaps(root, { filed })
    assert.equal(gaps.length, 1)
  })

  test('a merged plan covering the note closes it; an unmerged one claims it', async () => {
    const plan = basePlan()
    const root = await project({
      ...BASE,
      'knowledge/plans/the-daily-entry.plan.json': JSON.stringify(plan),
    })
    assert.deepEqual((await runKnowledgeGaps(root)).gaps, [])
    assert.deepEqual(
      (await runKnowledgeGaps(root, { merged: () => false })).gaps,
      []
    )
  })
  test('a note deleted after its changeset merged is a gap the other way', async () => {
    const { 'knowledge/entities/entry.md': _, ...rest } = BASE
    const root = await project({
      ...rest,
      'knowledge/plans/the-daily-entry.plan.json': JSON.stringify(basePlan()),
    })
    const { gaps } = await runKnowledgeGaps(root)
    assert.deepEqual(
      gaps.map((gap) => [gap.note, gap.state, gap.by]),
      [['knowledge/entities/entry.md', 'deleted', ['the-daily-entry']]]
    )
  })

  test('code a merged changeset built that is gone now flags its note', async () => {
    const root = await project({
      ...BASE,
      'knowledge/plans/the-daily-entry.plan.json': JSON.stringify(basePlan()),
      '.pikku/function/pikku-functions-meta.gen.json': JSON.stringify({
        somethingElse: {},
      }),
    })
    const [gap, ...rest] = (await runKnowledgeGaps(root)).gaps
    assert.equal(rest.length, 0)
    assert.equal(gap!.state, 'removed')
    assert.ok(gap!.missing.some((item) => item.includes('createEntry')))
    const built = knowledgeLine({
      note: 'knowledge/entities/entry.md',
      hash: noteHash('entry body'),
    })
    const again = await runKnowledgeGaps(root, { filed: [built] })
    assert.equal(again.gaps.length, 1, 'the change that built it does not hide it')
    const filed = await runKnowledgeGaps(root, {
      filed: [built, knowledgeLine(gap!)],
    })
    assert.equal(filed.gaps.length, 0)
  })

  test('no generated meta yet is not read as everything removed', async () => {
    const root = await project({
      ...BASE,
      'knowledge/plans/the-daily-entry.plan.json': JSON.stringify(basePlan()),
    })
    assert.deepEqual((await runKnowledgeGaps(root)).gaps, [])
  })
})
