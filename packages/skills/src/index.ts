import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { dirname, join, relative, sep } from 'path'
import { fileURLToPath } from 'url'
import { SKILL_FILES } from './skills.gen.js'

export { SKILL_FILES }

/**
 * Absolute path to the `skills/` directory shipped beside this module, or `null`
 * when there is no filesystem copy to read.
 *
 * Both `dist/` (published, and `src/` under tsx) sit one level below the package
 * root, so the directory is always `../skills` when a real filesystem is in play.
 * It is `null` inside the `bun --compile` CLI binaries, whose modules load from a
 * virtual path — that is the case `SKILL_FILES` exists to cover.
 */
export const skillsDir: string | null = (() => {
  const candidate = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'skills'
  )
  return existsSync(candidate) ? candidate : null
})()

const toPosix = (path: string) => path.split(sep).join('/')

/**
 * Reading prefers the filesystem so that editing a SKILL.md is immediately live
 * for `pikku skills install` without re-running `yarn embed`; the manifest is the
 * fallback for bundled contexts. The two are identical after a build.
 */
export const listSkillNames = async (): Promise<string[]> => {
  if (skillsDir) {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  }
  const names = new Set<string>()
  for (const path of Object.keys(SKILL_FILES)) {
    const name = path.split('/')[0]
    if (name) names.add(name)
  }
  return [...names].sort()
}

/** Every file belonging to one skill, as paths relative to the skills root. */
export const listSkillFiles = async (name: string): Promise<string[]> => {
  if (skillsDir) {
    const root = join(skillsDir, name)
    if (!existsSync(root)) return []
    const out: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full)
        else if (entry.isFile()) out.push(toPosix(relative(skillsDir!, full)))
      }
    }
    await walk(root)
    return out.sort()
  }
  return Object.keys(SKILL_FILES)
    .filter((path) => path.startsWith(`${name}/`))
    .sort()
}

/** Contents of one file, by its path relative to the skills root. */
export const readSkillFile = async (path: string): Promise<string | null> => {
  if (skillsDir) {
    const full = join(skillsDir, ...path.split('/'))
    if (!existsSync(full)) return null
    return readFile(full, 'utf-8')
  }
  return SKILL_FILES[path] ?? null
}
