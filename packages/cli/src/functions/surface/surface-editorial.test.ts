import assert from 'assert'
import { describe, test } from 'node:test'
import { listSkillFiles, listSkillNames, readSkillFile } from '@pikku/skills'
import { LEAF_EDITORIAL } from './surface-editorial.js'

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
          orphans.push(`${door} -> ${skill} (${groups.join(', ') || 'no group'})`)
        }
      }
    }
    assert.deepEqual(orphans, [])
  })
})
