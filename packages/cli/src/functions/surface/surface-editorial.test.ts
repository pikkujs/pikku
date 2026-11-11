import assert from 'assert'
import { describe, test } from 'node:test'
import { listSkillFiles, listSkillNames, readSkillFile } from '@pikku/skills'
import { leafEntries } from '../wirings/functions/pikku-command-leaf-indexes.js'
import { serializeReactQueryHooks } from '../wirings/rpc/serialize-react-query-hooks.js'
import { renderSurfaceDoc } from './render-surface-doc.js'
import type { SurfaceDoc } from './surface-doc.types.js'
import { LEAF_EDITORIAL, SURFACE_GUIDES } from './surface-editorial.js'

const installGroupsOf = async (name: string): Promise<string[]> => {
  const file = (await listSkillFiles(name)).find((path) =>
    path.endsWith('SKILL.md')
  )
  const text = file ? await readSkillFile(file) : null
  const declared = text?.match(/^installGroups:\s*\[([^\]]*)\]/m)?.[1]
  return declared
    ? declared.split(',').map((group) => group.trim().replace(/['"]/g, ''))
    : []
}

describe('the door to skill routing table', () => {
  test('only names skills that exist', async () => {
    const known = new Set(await listSkillNames())
    const missing = Object.entries(LEAF_EDITORIAL).flatMap(([door, entry]) =>
      [entry.skill]
        .flat()
        .filter((skill) => skill && !known.has(skill))
        .map((skill) => `${door} -> ${skill}`)
    )
    assert.deepEqual(missing, [])
  })

  test('only names skills a default install actually gets', async () => {
    const orphans: string[] = []
    for (const [door, entry] of Object.entries(LEAF_EDITORIAL)) {
      for (const skill of [entry.skill].flat()) {
        if (!skill) continue
        const groups = await installGroupsOf(skill)
        if (!groups.includes('core')) {
          orphans.push(
            `${door} -> ${skill} (${groups.join(', ') || 'no group'})`
          )
        }
      }
    }
    assert.deepEqual(orphans, [])
  })
})

describe('the editorial covers every leaf', () => {
  test('a leaf the CLI generates has an entry', () => {
    const missing = leafEntries
      .map(([leaf]) => leaf)
      .filter((leaf) => !(leaf in LEAF_EDITORIAL))
    assert.deepEqual(missing, [])
  })
})

describe('the guides', () => {
  const doc: SurfaceDoc = {
    version: '0.0.0',
    errors: [],
    entryPoints: [
      {
        id: 'app',
        job: 'build an app',
        specifierBase: '#pikku',
        summary: '',
        leaves: [
          {
            specifier: '#pikku/http',
            name: 'http',
            step: 'wire it up',
            summary: 'Routes.',
            skill: null,
            symbols: [],
          },
        ],
      },
    ],
  }

  test('every name opens its guide, and a name opens only one', () => {
    const names = SURFACE_GUIDES.flatMap((guide) => guide.names)
    assert.equal(new Set(names).size, names.length)
    for (const guide of SURFACE_GUIDES) {
      for (const name of guide.names) {
        assert.ok(
          renderSurfaceDoc(doc, { target: name }).startsWith(
            `${guide.names[0]} — `
          )
        )
      }
    }
  })

  test('the index lists each guide', () => {
    const index = renderSurfaceDoc(doc)
    for (const guide of SURFACE_GUIDES) {
      assert.ok(index.includes(guide.names[0]!), guide.names[0])
    }
  })

  test('prints the snippets a guide names, in order', () => {
    const guide = SURFACE_GUIDES.find(({ snippets }) => snippets)!
    const guideSnippets = Object.fromEntries(
      guide.snippets!.map(({ name }) => [name, `code of ${name}`])
    )
    const page = renderSurfaceDoc(
      { ...doc, guideSnippets },
      { target: guide.names[0]! }
    )
    const positions = guide.snippets!.map(({ step, name }) => {
      const at = page.indexOf(`  ${step}\n    code of ${name}`)
      assert.ok(at >= 0, name)
      return at
    })
    assert.deepEqual(
      positions,
      [...positions].sort((a, b) => a - b)
    )
  })

  test('a door keeps its name over a guide', () => {
    assert.ok(
      renderSurfaceDoc(doc, { target: 'http' }).startsWith('#pikku/http')
    )
  })

  test('the hooks it names as generated are generated', () => {
    const generated = serializeReactQueryHooks('rpc', 'workflow', true)
    const hooks = SURFACE_GUIDES.flatMap((guide) => guide.names).filter(
      (name) => /^use/.test(name) && name !== 'usePikkuAgent'
    )
    assert.ok(hooks.length > 0)
    for (const hook of hooks) {
      assert.ok(generated.includes(`export const ${hook} =`), hook)
    }
  })
})
