import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

const skillsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'skills'
)

const KNOWN_INSTALL_GROUPS = new Set(['core', 'fabric'])
const SUBDIRS = ['references', 'scripts', 'example', 'assets']

type Skill = {
  name: string
  dir: string
  frontmatter: string
  body: string
}

async function readSkills(): Promise<Skill[]> {
  const entries = (await readdir(skillsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  const skills: Skill[] = []
  for (const name of entries) {
    const skillPath = join(skillsDir, name, 'SKILL.md')
    if (!existsSync(skillPath)) {
      skills.push({
        name,
        dir: join(skillsDir, name),
        frontmatter: '',
        body: '',
      })
      continue
    }
    const content = await readFile(skillPath, 'utf-8')
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
    skills.push({
      name,
      dir: join(skillsDir, name),
      frontmatter: match?.[1] ?? '',
      body: match?.[2] ?? content,
    })
  }
  return skills
}

function field(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(
    new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'm')
  )
  return match?.[1]?.replace(/^['"]|['"]$/g, '')
}

/**
 * Collect backticked relative paths that point at a skill's own subdirectories
 * (references/, scripts/, example/, assets/). Scoped to those prefixes so prose
 * mentioning e.g. `src/` or a bare filename does not register as a false hit.
 */
function referencedPaths(text: string): string[] {
  const found = new Set<string>()
  const backticked = text.matchAll(/`([^`\n]+)`/g)
  for (const [, raw] of backticked) {
    const token = raw.trim().replace(/^\.\//, '')
    if (SUBDIRS.some((sub) => token === sub || token.startsWith(`${sub}/`))) {
      found.add(token)
    }
  }
  const inlined = text.matchAll(
    new RegExp(
      `(?:<skill-dir>|skills)/[\\w.-]+/((?:${SUBDIRS.join('|')})/[\\w./-]+)`,
      'g'
    )
  )
  for (const [, path] of inlined) {
    found.add(path)
  }
  return [...found]
}

describe('bundled skills corpus', () => {
  test('every skill directory has a SKILL.md', async () => {
    const skills = await readSkills()
    assert.ok(skills.length > 0, 'expected bundled skills to exist')
    for (const skill of skills) {
      assert.ok(
        existsSync(join(skill.dir, 'SKILL.md')),
        `${skill.name}: missing SKILL.md`
      )
    }
  })

  test('every skill has parseable frontmatter with name and description', async () => {
    for (const skill of await readSkills()) {
      assert.ok(
        skill.frontmatter.length > 0,
        `${skill.name}: SKILL.md has no --- frontmatter block`
      )
      const description = field(skill.frontmatter, 'description')
      assert.ok(
        description && description.length > 20,
        `${skill.name}: description missing or too short to route on`
      )
    }
  })

  test('frontmatter name matches the directory name', async () => {
    for (const skill of await readSkills()) {
      assert.equal(
        field(skill.frontmatter, 'name'),
        skill.name,
        `${skill.name}: frontmatter name must match its directory`
      )
    }
  })

  test('skill names are unique', async () => {
    const names = (await readSkills()).map((s) => s.name)
    assert.deepEqual(
      names.filter((n, i) => names.indexOf(n) !== i),
      [],
      'duplicate skill names'
    )
  })

  test('installGroups only reference known groups', async () => {
    for (const skill of await readSkills()) {
      const raw = field(skill.frontmatter, 'installGroups')
      if (!raw) continue
      const groups = raw
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((g) => g.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
      for (const group of groups) {
        assert.ok(
          KNOWN_INSTALL_GROUPS.has(group),
          `${skill.name}: unknown installGroup "${group}" — it would never be installed by any flag`
        )
      }
    }
  })

  test('relative paths referenced in a skill resolve on disk', async () => {
    for (const skill of await readSkills()) {
      const docs = [skill.body]
      const readme = join(skill.dir, 'README.md')
      if (existsSync(readme)) docs.push(await readFile(readme, 'utf-8'))

      for (const doc of docs) {
        for (const path of referencedPaths(doc)) {
          assert.ok(
            existsSync(join(skill.dir, path)),
            `${skill.name}: references "${path}" which does not exist`
          )
        }
      }
    }
  })
})
