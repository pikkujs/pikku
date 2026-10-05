import { existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { listSkillFiles, listSkillNames, readSkillFile, SKILL_FILES } from '@pikku/skills'

const CLOUD_ONLY = /fabric/

export const builderHome = () => process.env.PIKKU_BUILDER_HOME ?? join(homedir(), '.pikku', 'builder')

const skillsVersion = (): string => createHash('sha256').update(JSON.stringify(SKILL_FILES)).digest('hex').slice(0, 16)

export async function writeSkills(home = builderHome()): Promise<string> {
  const dir = join(home, 'skills', skillsVersion())
  if (existsSync(dir)) return dir
  const staging = `${dir}.${process.pid}`
  await rm(staging, { recursive: true, force: true })
  for (const name of await listSkillNames()) {
    if (CLOUD_ONLY.test(name)) continue
    for (const path of await listSkillFiles(name)) {
      const text = await readSkillFile(path)
      if (text === null) continue
      const target = join(staging, path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, text)
    }
  }
  await mkdir(dirname(dir), { recursive: true })
  await rename(staging, dir).catch(async (error) => {
    if (!existsSync(dir)) throw error
    await rm(staging, { recursive: true, force: true })
  })
  return dir
}
