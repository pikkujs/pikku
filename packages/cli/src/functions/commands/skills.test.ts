import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, test } from 'node:test'
import { parse } from 'yaml'
import { pikkuSkillsInstall } from './skills.js'

const skillsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'skills'
)

const KNOWN_INSTALL_GROUPS = new Set(['core', 'fabric'])

/**
 * Fabric group membership is deliberate and small, so it is pinned here rather
 * than derived from the corpus — deriving it would make the assertion vacuous
 * (dropping a tag would shrink both sides and still pass). Adding a skill to
 * the Fabric set means updating this list on purpose.
 */
const FABRIC_SKILLS = [
  'pikku-deploy-cloudflare',
  'pikku-fabric',
  'pikku-schema-cfworker',
  'pikku-product-second-opinion',
  'pikku-software-archaeology',
]
const SUBDIRS = ['references', 'scripts', 'example', 'assets']

type Frontmatter = {
  name?: unknown
  description?: unknown
  installGroups?: unknown
}

type Skill = {
  name: string
  dir: string
  /** Parsed frontmatter, or null when absent/unparseable. */
  frontmatter: Frontmatter | null
  /** Why parsing failed, for a useful assertion message. */
  parseError: string | null
  body: string
}

async function readSkills(): Promise<Skill[]> {
  const entries = (await readdir(skillsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  const skills: Skill[] = []
  for (const name of entries) {
    const dir = join(skillsDir, name)
    const skillPath = join(dir, 'SKILL.md')
    if (!existsSync(skillPath)) {
      skills.push({
        name,
        dir,
        frontmatter: null,
        parseError: 'SKILL.md not found',
        body: '',
      })
      continue
    }
    const content = await readFile(skillPath, 'utf-8')
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
    if (!match) {
      skills.push({
        name,
        dir,
        frontmatter: null,
        parseError: 'no --- frontmatter block',
        body: content,
      })
      continue
    }

    let frontmatter: Frontmatter | null = null
    let parseError: string | null = null
    try {
      const parsed: unknown = parse(match[1])
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        parseError = `expected a mapping, got ${Array.isArray(parsed) ? 'a list' : typeof parsed}`
      } else {
        frontmatter = parsed as Frontmatter
      }
    } catch (e) {
      parseError = (e as Error).message.split('\n')[0]
    }
    skills.push({ name, dir, frontmatter, parseError, body: match[2] })
  }
  return skills
}

function installGroupsOf(skill: Skill): string[] {
  const raw = skill.frontmatter?.installGroups
  if (raw === undefined || raw === null) return []
  return (Array.isArray(raw) ? raw : [raw]).map((g) => String(g).trim())
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

  test("every skill parses under the agent runtime's YAML parser", async () => {
    for (const skill of await readSkills()) {
      // pi.dev parses SKILL.md frontmatter with this same `yaml` package, then
      // silently drops the skill on a parse error (a warning diagnostic, and
      // `skill: null`). A lenient parser (js-yaml) accepts frontmatter this one
      // rejects, so the corpus must be validated with the strict one or broken
      // skills ship invisibly.
      assert.equal(
        skill.parseError,
        null,
        `${skill.name}: frontmatter did not parse — ${skill.parseError}. ` +
          `pi.dev would silently drop this skill.`
      )
      const description = skill.frontmatter?.description
      assert.ok(
        typeof description === 'string' && description.length > 20,
        `${skill.name}: description missing or too short to route on`
      )
      assert.ok(
        typeof description === 'string' && description.length <= 1024,
        `${skill.name}: description exceeds pi's 1024-char limit`
      )
    }
  })

  test('frontmatter name matches the directory name', async () => {
    for (const skill of await readSkills()) {
      assert.equal(
        skill.frontmatter?.name,
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
      for (const group of installGroupsOf(skill)) {
        assert.ok(
          KNOWN_INSTALL_GROUPS.has(group),
          `${skill.name}: unknown installGroup "${group}" — it would never be installed by any flag`
        )
      }
    }
  })

  test('the fabric group holds exactly the intended skills', async () => {
    const tagged: string[] = []
    for (const skill of await readSkills()) {
      if (installGroupsOf(skill).includes('fabric')) tagged.push(skill.name)
    }
    assert.deepEqual(
      tagged.sort(),
      [...FABRIC_SKILLS].sort(),
      'fabric group membership changed — update FABRIC_SKILLS if this is intended'
    )
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
    if (installGroupsOf(skill).includes(group)) matching.push(skill.name)
  }
  return matching.sort()
}

const AGENT_DIRS: Record<string, string> = {
  claude: '.claude',
  opencode: '.opencode',
  pi: '.pi',
}

async function installed(root: string, agent = 'claude'): Promise<string[]> {
  const dir = join(root, AGENT_DIRS[agent]!, 'skills')
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
    await run({
      only: 'pikku-software-archaeology,pikku-product-second-opinion',
    })
    assert.deepEqual(await installed(dir), [
      'pikku-product-second-opinion',
      'pikku-software-archaeology',
    ])
    assert.equal(process.exitCode, undefined)
  })

  test('--only copies the whole skill directory, not just SKILL.md', async () => {
    const dir = await inTemp()
    await run({ only: 'pikku-software-archaeology' })
    const root = join(dir, '.claude', 'skills', 'pikku-software-archaeology')
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
    await run({ only: 'pikku-software-archaeology,definitely-not-a-skill' })
    assert.equal(process.exitCode, 1)
    assert.deepEqual(await installed(dir), [])
  })

  test('an unsupported agent errors and installs nothing', async () => {
    const dir = await inTemp()
    await run({ agent: 'emacs', only: 'pikku-software-archaeology' })
    assert.equal(process.exitCode, 1)
    assert.deepEqual(await installed(dir), [])
  })

  test('--agent opencode installs into .opencode/skills', async () => {
    const dir = await inTemp()
    await run({ agent: 'opencode', only: 'pikku-software-archaeology' })
    assert.deepEqual(await installed(dir, 'opencode'), [
      'pikku-software-archaeology',
    ])
    assert.deepEqual(await installed(dir, 'claude'), [])
  })

  test('--agent pi installs into .pi/skills, where pi.dev reads project skills', async () => {
    const dir = await inTemp()
    await run({ agent: 'pi', only: 'pikku-software-archaeology' })
    assert.deepEqual(await installed(dir, 'pi'), ['pikku-software-archaeology'])
    assert.deepEqual(await installed(dir, 'claude'), [])
    assert.deepEqual(await installed(dir, 'opencode'), [])
    assert.equal(process.exitCode, undefined)
  })

  test('--agent pi copies the whole skill directory', async () => {
    const dir = await inTemp()
    await run({ agent: 'pi', only: 'pikku-software-archaeology' })
    const root = join(dir, '.pi', 'skills', 'pikku-software-archaeology')
    for (const file of [
      'SKILL.md',
      join('references', 'blueprint.schema.json'),
      join('scripts', 'validate.mjs'),
    ]) {
      assert.ok(existsSync(join(root, file)), `missing ${file} after install`)
    }
  })

  test('--agent pi honours group filters', async () => {
    const dir = await inTemp()
    await run({ agent: 'pi', fabric: true })
    assert.deepEqual(
      await installed(dir, 'pi'),
      await skillsWithGroup('fabric')
    )
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

  test('--fabric installs the fabric-tagged skills, not the whole corpus', async () => {
    const dir = await inTemp()
    await run({ fabric: true })

    const fabric = await skillsWithGroup('fabric')
    const all = (await readSkills()).map((s) => s.name)
    assert.deepEqual(await installed(dir), fabric)
    assert.ok(
      fabric.length < all.length,
      'expected --fabric to be a strict subset'
    )
  })

  test('--core and --fabric together install the union of both groups', async () => {
    const dir = await inTemp()
    await run({ core: true, fabric: true })

    const union = [
      ...new Set([
        ...(await skillsWithGroup('core')),
        ...(await skillsWithGroup('fabric')),
      ]),
    ].sort()
    assert.deepEqual(await installed(dir), union)
  })

  test('a second install skips existing skills unless --update is passed', async () => {
    const dir = await inTemp()
    await run({ only: 'pikku-software-archaeology' })

    const skillMd = join(
      dir,
      '.claude',
      'skills',
      'pikku-software-archaeology',
      'SKILL.md'
    )
    await writeFile(skillMd, 'locally edited', 'utf-8')

    await run({ only: 'pikku-software-archaeology' })
    assert.equal(
      await readFile(skillMd, 'utf-8'),
      'locally edited',
      'install without --update must not clobber an existing skill'
    )

    await run({ only: 'pikku-software-archaeology', update: true })
    assert.notEqual(
      await readFile(skillMd, 'utf-8'),
      'locally edited',
      '--update must overwrite an existing skill'
    )
  })
})
