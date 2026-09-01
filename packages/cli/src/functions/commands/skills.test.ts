import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { parse } from 'yaml'
import { listSkillNames, readSkillFile } from '@pikku/skills'
import { pikkuSkillsInstall } from './skills.js'

/**
 * Which install groups a skill declares, read through @pikku/skills so these
 * tests exercise the same source the command does. Corpus-level assertions about
 * the skills themselves live in @pikku/skills — this file is only about what the
 * install command writes where.
 */
async function installGroupsOf(name: string): Promise<string[]> {
  const content = await readSkillFile(`${name}/SKILL.md`)
  const frontmatter = content?.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatter) return []
  const raw = (parse(frontmatter[1]!) as { installGroups?: unknown })
    ?.installGroups
  if (raw === undefined || raw === null) return []
  return (Array.isArray(raw) ? raw : [raw]).map((group) => String(group).trim())
}

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

async function skillsWithGroup(group: string): Promise<string[]> {
  const matching: string[] = []
  for (const name of await listSkillNames()) {
    if ((await installGroupsOf(name)).includes(group)) matching.push(name)
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
      only: 'pikku-software-archaeology,pikku-kysely',
    })
    assert.deepEqual(await installed(dir), [
      'pikku-kysely',
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
    const all = await listSkillNames()
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
    const all = await listSkillNames()
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
