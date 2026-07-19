import { readdir, readFile, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname, sep } from 'path'
import { fileURLToPath } from 'url'
import { pikkuSessionlessFunc } from '#pikku'

/**
 * Walk up from this compiled file to find the package root (the directory
 * containing the @pikku/cli package.json), then resolve `<root>/skills/`.
 * Works whether the file is loaded from `dist/...` (published package) or
 * `src/...` (local dev via tsx/vitest).
 */
async function findSkillsDir(): Promise<string> {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as {
          name?: string
        }
        if (pkg.name === '@pikku/cli') {
          const skills = join(dir, 'skills')
          if (existsSync(skills)) return skills
        }
      } catch {}
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(
    'Could not locate bundled skills directory. Was @pikku/cli installed correctly?'
  )
}

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const s = join(src, entry.name)
    const d = join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(s, d)
    } else if (entry.isFile()) {
      const content = await readFile(s)
      await writeFile(d, content)
    }
  }
}

/**
 * Where each supported agent reads project-local skills from, relative to the
 * project root. `pi` mirrors pi.dev's own resolution: it scans
 * `<cwd>/<CONFIG_DIR_NAME>/skills` for project skills, where CONFIG_DIR_NAME
 * defaults to `.pi`.
 */
const AGENT_SKILL_DIRS: Record<string, string> = {
  claude: join('.claude', 'skills'),
  opencode: join('.opencode', 'skills'),
  pi: join('.pi', 'skills'),
}

function parseInstallGroups(frontmatter: string): string[] {
  const inline = frontmatter.match(/^\s*installGroups\s*:\s*\[([^\]]*)\]/m)
  if (inline) {
    return inline[1]
      .split(',')
      .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }

  const block = frontmatter.match(
    /^\s*installGroups\s*:\s*\n((?:\s*-\s*[^\n]+\n?)*)/m
  )
  if (block) {
    return block[1]
      .split('\n')
      .map((line) =>
        line
          .match(/^\s*-\s*(.+)\s*$/)?.[1]
          ?.trim()
          .replace(/^['"]|['"]$/g, '')
      )
      .filter(Boolean) as string[]
  }

  const single = frontmatter.match(/^\s*installGroups\s*:\s*([^\n]+)/m)
  if (single) {
    const value = single[1].trim().replace(/^['"]|['"]$/g, '')
    return value ? [value] : []
  }

  return []
}

async function readSkillInstallGroups(
  skillsDir: string,
  skillName: string
): Promise<string[]> {
  const skillPath = join(skillsDir, skillName, 'SKILL.md')
  if (!existsSync(skillPath)) return []
  const content = await readFile(skillPath, 'utf-8')
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return []
  return parseInstallGroups(match[1])
}

async function getWantedSkills(
  skillsDir: string,
  allEntries: string[],
  {
    only,
    core = false,
    fabric = false,
  }: { only?: string; core?: boolean; fabric?: boolean }
): Promise<string[]> {
  const wanted = new Set<string>()

  if (only) {
    for (const name of only
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      wanted.add(name)
    }
  }

  const requestedGroups = [
    ...(core ? ['core'] : []),
    ...(fabric ? ['fabric'] : []),
  ]

  if (requestedGroups.length > 0) {
    for (const name of allEntries) {
      const groups = await readSkillInstallGroups(skillsDir, name)
      if (requestedGroups.some((group) => groups.includes(group))) {
        wanted.add(name)
      }
    }
  }

  return wanted.size === 0 ? allEntries : [...wanted].sort()
}

export const pikkuSkillsList = pikkuSessionlessFunc<{ target?: string }, void>({
  func: async ({ logger }) => {
    const skillsDir = await findSkillsDir()
    const entries = (await readdir(skillsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()

    const installed = new Set<string>()
    for (const relative of Object.values(AGENT_SKILL_DIRS)) {
      const dir = join(process.cwd(), relative)
      if (existsSync(dir)) {
        for (const e of await readdir(dir, { withFileTypes: true })) {
          if (e.isDirectory() || e.isSymbolicLink()) installed.add(e.name)
        }
      }
    }

    logger.info(`Bundled skills (${entries.length}):`)
    for (const name of entries) {
      const marker = installed.has(name) ? '✓' : ' '
      console.log(`  ${marker} ${name}`)
    }
    console.log('')
    console.log('Run `pikku skills install` to copy them into .claude/skills/')
    console.log(
      'Run `pikku skills install --core --fabric` to install the Fabric sandbox skill set.'
    )
    console.log(
      'Run `pikku skills install --agent opencode` to copy them into .opencode/skills/'
    )
    console.log(
      'Run `pikku skills install --agent pi` to copy them into .pi/skills/'
    )
  },
})

export const pikkuSkillsInstall = pikkuSessionlessFunc<
  {
    agent?: string
    only?: string
    core?: boolean
    fabric?: boolean
    update?: boolean
  },
  void
>({
  func: async (
    { logger },
    { agent = 'claude', only, core = false, fabric = false, update = false }
  ) => {
    const supportedAgents = Object.keys(AGENT_SKILL_DIRS)
    if (!supportedAgents.includes(agent)) {
      logger.error(
        `Agent "${agent}" is not yet supported. Supported: ${supportedAgents.join(', ')}. ` +
          `(codex/gemini will emit AGENTS.md/GEMINI.md from the same source — coming soon.)`
      )
      process.exitCode = 1
      return
    }

    const skillsDir = await findSkillsDir()
    const allEntries = (await readdir(skillsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()

    const wanted = await getWantedSkills(skillsDir, allEntries, {
      only,
      core,
      fabric,
    })
    const missing = wanted.filter((n) => !allEntries.includes(n))
    if (missing.length > 0) {
      logger.error(`Unknown skill(s): ${missing.join(', ')}`)
      process.exitCode = 1
      return
    }

    const installRoot = join(process.cwd(), AGENT_SKILL_DIRS[agent]!)
    await mkdir(installRoot, { recursive: true })

    let installed = 0
    let skipped = 0
    for (const name of wanted) {
      const src = join(skillsDir, name)
      const dest = join(installRoot, name)
      if (existsSync(dest) && !update) {
        skipped++
        continue
      }
      await copyDir(src, dest)
      installed++
    }

    const destLabel = `${AGENT_SKILL_DIRS[agent]!.split(sep).join('/')}/`
    logger.info(
      `Installed ${installed} skill(s) into ${destLabel}${
        skipped > 0
          ? ` (skipped ${skipped} already present — pass --update to overwrite)`
          : ''
      }`
    )
  },
})
