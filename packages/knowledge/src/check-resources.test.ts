import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { checkKnowledgeResources } from './check-resources.js'

const project = async (files: Record<string, unknown>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-check-'))
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(root, rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(
      full,
      typeof contents === 'string' ? contents : JSON.stringify(contents),
      'utf8'
    )
  }
  return root
}

const check = (root: string) =>
  checkKnowledgeResources(root, join(root, '.pikku'))

const FUNC_META = {
  '.pikku/function/pikku-functions-meta.gen.json': {
    createEntry: {},
    listEntries: {},
  },
}

describe('checkKnowledgeResources', () => {
  test('passes when every resource resolves', async () => {
    const root = await project({
      ...FUNC_META,
      'knowledge/slices/01-a.md':
        '---\ntype: slice\nresource: func:createEntry, func:listEntries\n---\nx',
    })
    const result = await check(root)
    assert.deepEqual(result.problems, [])
    assert.equal(result.ok, true)
    assert.equal(result.notes, 1)
    assert.equal(result.checked, 2)
  })

  test('reports a dangling id — the note survived a rename the code did not keep', async () => {
    const root = await project({
      ...FUNC_META,
      'knowledge/slices/01-a.md':
        '---\ntype: slice\nresource: func:createEntrey\n---\nx',
    })
    const result = await check(root)
    assert.equal(result.ok, false)
    assert.equal(result.problems.length, 1)
    assert.equal(result.problems[0]!.reason, 'dangling')
    assert.match(result.problems[0]!.detail, /no func named "createEntrey"/)
  })

  test('reports an invented kind separately from drift', async () => {
    const root = await project({
      ...FUNC_META,
      'knowledge/entities/a.md':
        '---\ntype: entity\nresource: service:kysely\n---\nx',
    })
    const result = await check(root)
    assert.equal(result.problems[0]!.reason, 'unknown-prefix')
    assert.match(result.problems[0]!.detail, /the kinds are func, workflow/)
  })

  test('skips a prefix this project has no meta for rather than failing it', async () => {
    // Fails CLOSED on drift, OPEN on ignorance. A project with no queues that
    // mentions one is unverifiable, not wrong — reporting it would train everyone
    // to ignore the check.
    const root = await project({
      ...FUNC_META,
      'knowledge/slices/01-a.md':
        '---\ntype: slice\nresource: queue:nightly-digest\n---\nx',
    })
    const result = await check(root)
    assert.equal(result.ok, true)
    assert.equal(result.skipped, 1)
    assert.equal(result.checked, 0)
  })

  test('checks a resolvable prefix even when another in the same note is skipped', async () => {
    const root = await project({
      ...FUNC_META,
      'knowledge/slices/01-a.md':
        '---\ntype: slice\nresource: queue:nightly, func:gone\n---\nx',
    })
    const result = await check(root)
    assert.equal(result.skipped, 1)
    assert.equal(result.checked, 1)
    assert.equal(result.problems.length, 1)
    assert.equal(result.problems[0]!.uri, 'func:gone')
  })

  test('counts only the notes that carry a resource', async () => {
    const root = await project({
      ...FUNC_META,
      'knowledge/index.md': '---\ntype: overview\n---\nx',
      'knowledge/slices/01-a.md':
        '---\ntype: slice\nresource: func:createEntry\n---\nx',
    })
    assert.equal((await check(root)).notes, 1)
  })

  test('a project with no knowledge base is trivially ok', async () => {
    const root = await project(FUNC_META)
    assert.deepEqual(await check(root), {
      ok: true,
      notes: 0,
      checked: 0,
      skipped: 0,
      problems: [],
    })
  })

  test('reports the note path, which is what the reader has to go fix', async () => {
    const root = await project({
      ...FUNC_META,
      'knowledge/decisions/why.md':
        '---\ntype: decision\nresource: func:gone\n---\nx',
    })
    const result = await check(root)
    assert.equal(
      result.problems[0]!.path,
      join('knowledge', 'decisions', 'why.md')
    )
  })
})
