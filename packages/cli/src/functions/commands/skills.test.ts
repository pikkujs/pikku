import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, test } from 'node:test'
import { pikkuSkillsInstall } from './skills.js'

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

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

async function skillsWithGroup(group: string): Promise<string[]> {
  const matching: string[] = []
  for (const skill of await readSkills()) {
    const raw = field(skill.frontmatter, 'installGroups')
    if (!raw) continue
    const groups = raw
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((g) => g.trim().replace(/^['"]|['"]$/g, ''))
    if (groups.includes(group)) matching.push(skill.name)
  }
  return matching.sort()
}

async function installed(root: string, agent = 'claude'): Promise<string[]> {
  const dir = join(
    root,
    agent === 'opencode' ? '.opencode' : '.claude',
    'skills'
  )
  if (!existsSync(dir)) return []
  return (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

describe('pikku skills install', () => {
  const cwd = process.cwd()
  const temps: string[] = []

  afterEach(async () => {
    process.chdir(cwd)
    process.exitCode = undefined
    for (const dir of temps.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  async function inTemp(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'pikku-skills-install-'))
    temps.push(dir)
    process.chdir(dir)
    return dir
  }

  const run = (data: Record<string, unknown>) =>
    (pikkuSkillsInstall as any).func({ logger }, data)

  test('--only installs exactly the named skills', async () => {
    const dir = await inTemp()
    await run({ only: 'software-archaeology,product-second-opinion' })
    assert.deepEqual(await installed(dir), [
      'product-second-opinion',
      'software-archaeology',
    ])
    assert.equal(process.exitCode, undefined)
  })

  test('--only copies the whole skill directory, not just SKILL.md', async () => {
    const dir = await inTemp()
    await run({ only: 'software-archaeology' })
    const root = join(dir, '.claude', 'skills', 'software-archaeology')
    for (const file of [
      'SKILL.md',
      join('references', 'blueprint.schema.json'),
      join('scripts', 'validate.mjs'),
    ]) {
      assert.ok(existsSync(join(root, file)), `missing ${file} after install`)
    }
  })

  test('--only with an unknown skill errors and installs nothing', async () => {
    const dir = await inTemp()
    await run({ only: 'software-archaeology,definitely-not-a-skill' })
    assert.equal(process.exitCode, 1)
    assert.deepEqual(await installed(dir), [])
  })

  test('an unsupported agent errors and installs nothing', async () => {
    const dir = await inTemp()
    await run({ agent: 'emacs', only: 'software-archaeology' })
    assert.equal(process.exitCode, 1)
    assert.deepEqual(await installed(dir), [])
  })

  test('--agent opencode installs into .opencode/skills', async () => {
    const dir = await inTemp()
    await run({ agent: 'opencode', only: 'software-archaeology' })
    assert.deepEqual(await installed(dir, 'opencode'), ['software-archaeology'])
    assert.deepEqual(await installed(dir, 'claude'), [])
  })

  test('--core installs the core-tagged skills, not the whole corpus', async () => {
    const dir = await inTemp()
    await run({ core: true })

    const core = await skillsWithGroup('core')
    const all = (await readSkills()).map((s) => s.name)
    assert.deepEqual(await installed(dir), core)
    assert.ok(
      core.length < all.length,
      'expected --core to be a strict subset; if every skill were core-tagged ' +
        'this assertion could not distinguish the group filter from the ' +
        'install-everything fallback'
    )
  })

  test('a second install skips existing skills unless --update is passed', async () => {
    const dir = await inTemp()
    await run({ only: 'software-archaeology' })

    const skillMd = join(
      dir,
      '.claude',
      'skills',
      'software-archaeology',
      'SKILL.md'
    )
    await writeFile(skillMd, 'locally edited', 'utf-8')

    await run({ only: 'software-archaeology' })
    assert.equal(
      await readFile(skillMd, 'utf-8'),
      'locally edited',
      'install without --update must not clobber an existing skill'
    )

    await run({ only: 'software-archaeology', update: true })
    assert.notEqual(
      await readFile(skillMd, 'utf-8'),
      'locally edited',
      '--update must overwrite an existing skill'
    )
  })
})
