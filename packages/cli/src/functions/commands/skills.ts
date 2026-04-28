import { readdir, readFile, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
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

export const pikkuSkillsList = pikkuSessionlessFunc<{ target?: string }, void>({
  func: async ({ logger }) => {
    const skillsDir = await findSkillsDir()
    const entries = (await readdir(skillsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()

    const installed = new Set<string>()
    const installDir = join(process.cwd(), '.claude', 'skills')
    if (existsSync(installDir)) {
      for (const e of await readdir(installDir, { withFileTypes: true })) {
        if (e.isDirectory() || e.isSymbolicLink()) installed.add(e.name)
      }
    }

    logger.info(`Bundled skills (${entries.length}):`)
    for (const name of entries) {
      const marker = installed.has(name) ? '✓' : ' '
      console.log(`  ${marker} ${name}`)
    }
    console.log('')
    console.log('Run `pikku skills install` to copy them into .claude/skills/')
  },
})

export const pikkuSkillsInstall = pikkuSessionlessFunc<
  { target?: string; only?: string; update?: boolean },
  void
>({
  func: async ({ logger }, { target = 'claude', only, update = false }) => {
    if (target !== 'claude') {
      logger.error(
        `Target "${target}" is not yet supported. Only --target claude is implemented. ` +
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

    const wanted = only
      ? only
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : allEntries
    const missing = wanted.filter((n) => !allEntries.includes(n))
    if (missing.length > 0) {
      logger.error(`Unknown skill(s): ${missing.join(', ')}`)
      process.exitCode = 1
      return
    }

    const installRoot = join(process.cwd(), '.claude', 'skills')
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

    logger.info(
      `Installed ${installed} skill(s) into .claude/skills/${
        skipped > 0
          ? ` (skipped ${skipped} already present — pass --update to overwrite)`
          : ''
      }`
    )
  },
})
