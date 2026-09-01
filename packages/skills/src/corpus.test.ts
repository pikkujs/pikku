import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { parse } from 'yaml'
import {
  SKILL_FILES,
  listSkillFiles,
  listSkillNames,
  skillsDir,
} from './index.js'

assert.ok(skillsDir, 'expected a skills/ directory beside this package')
const root = skillsDir

const KNOWN_INSTALL_GROUPS = new Set(['core', 'client', 'fabric'])

/**
 * Fabric group membership is deliberate and small, so it is pinned here rather
 * than derived from the corpus — deriving it would make the assertion vacuous
 * (dropping a tag would shrink both sides and still pass). Adding a skill to
 * the Fabric set means updating this list on purpose.
 */
const FABRIC_SKILLS = [
  'pikku-ai-vercel',
  'pikku-ai-voice',
  'pikku-better-auth',
  'pikku-emails',
  'pikku-fabric',
  'pikku-fabric-debug',
  'pikku-i18n',
  'pikku-jose',
  'pikku-kysely',
  'pikku-machine-auth',
  'pikku-n8n-import',
  'pikku-react-query',
  'pikku-rpc',
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
  const skills: Skill[] = []
  for (const name of await listSkillNames()) {
    const dir = join(root, name)
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
      const parsed: unknown = parse(match[1]!)
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
      parseError = (e as Error).message.split('\n')[0]!
    }
    skills.push({ name, dir, frontmatter, parseError, body: match[2]! })
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
    const token = raw!.trim().replace(/^\.\//, '')
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
    found.add(path!)
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

  test("no skill teaches a router Link through Mantine's component prop", async () => {
    // `component={Link}` compiles and navigates, and widens the router generic
    // to AnyRouter on the way — `to` and `params` stop being checked against
    // the real routes, so renaming one breaks the running app instead of the
    // build. `renderRoot` with a wrapped, typed Link keeps the checking.
    const offenders: string[] = []
    for (const skill of await readSkills()) {
      // Code only: the prose that warns about it has to be able to spell it.
      let inFence = false
      for (const [i, line] of skill.body.split('\n').entries()) {
        if (line.startsWith('```')) {
          inFence = !inFence
          continue
        }
        if (inFence && /component=\{Link\}/.test(line)) {
          offenders.push(`${skill.name}:${i + 1}`)
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `use renderRoot with a wrapped Link instead: ${offenders.join(', ')}`
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

describe('the embedded manifest', () => {
  /** Every file under skills/, as the POSIX-relative keys the manifest uses. */
  async function filesOnDisk(): Promise<string[]> {
    const out: string[] = []
    for (const name of await listSkillNames())
      out.push(...(await listSkillFiles(name)))
    const loose = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
    return [...out, ...loose].sort()
  }

  test('is in sync with skills/ on disk', async () => {
    // A stale manifest is invisible in every context except the one that matters:
    // the `bun --compile` binaries read it instead of the filesystem, so an edit
    // that was never embedded ships the old text to every Homebrew user.
    //
    // run-tests.sh re-embeds before the run, which is what lets a fresh clone run
    // at all — skills.gen.ts is gitignored. This still fires under --watch, where
    // a skill edited mid-session re-runs the tests but not the embed.
    assert.deepEqual(
      Object.keys(SKILL_FILES).sort(),
      await filesOnDisk(),
      'skills.gen.ts is out of date — run `yarn embed` in @pikku/skills'
    )
    for (const [path, contents] of Object.entries(SKILL_FILES)) {
      assert.equal(
        contents,
        await readFile(join(root, ...path.split('/')), 'utf-8'),
        `${path} differs from the embedded copy — run \`yarn embed\``
      )
    }
  })

  test('holds only text, which is what makes it lossless', async () => {
    // The manifest stores strings, so a binary asset would be silently corrupted
    // on its way into the CLI binary. Keep assets out, or teach embed.mjs base64.
    for (const [path, contents] of Object.entries(SKILL_FILES)) {
      assert.ok(
        !contents.includes('\u0000'),
        `${path} looks binary — the manifest only round-trips text`
      )
    }
  })
})
