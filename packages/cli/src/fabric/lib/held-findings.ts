import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import type { FindingPayload } from './finding.js'

/**
 * Findings the user has not yet agreed to send. They are filed the moment
 * something goes wrong and asked about once, at hand-over. They live in
 * `~/.fabric`, not the repo, so git never sees them.
 */
export function heldDir(): string {
  return (
    process.env.FABRIC_FINDINGS_DIR ?? join(homedir(), '.fabric', 'findings')
  )
}

const runsFile = () => join(heldDir(), 'runs.json')

/** The checkout a finding came from: the nearest pikku.config.json, else cwd. */
export function checkoutRoot(startDir = process.cwd()): string {
  let dir = resolve(startDir)
  while (true) {
    if (existsSync(join(dir, 'pikku.config.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return resolve(startDir)
    dir = parent
  }
}

/**
 * One id per checkout, made the first time it reports. Every finding carries
 * it, so fabric sees one build's findings together without learning anything
 * about the project.
 */
export async function runIdFor(root = checkoutRoot()): Promise<string> {
  let runs: Record<string, string> = {}
  if (existsSync(runsFile())) {
    try {
      runs = JSON.parse(await readFile(runsFile(), 'utf8'))
    } catch {
      runs = {}
    }
  }
  if (runs[root]) return runs[root]
  runs[root] = randomUUID()
  await mkdir(heldDir(), { recursive: true })
  await writeFile(runsFile(), JSON.stringify(runs, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  })
  return runs[root]
}

export interface HeldFinding {
  file: string
  payload: FindingPayload
}

export async function holdFinding(payload: FindingPayload): Promise<void> {
  const dir = join(heldDir(), payload.runId)
  await mkdir(dir, { recursive: true })
  const stamp = payload.reportedAt.replace(/[:.]/g, '-')
  await writeFile(
    join(dir, `${stamp}-${randomBytes(3).toString('hex')}.json`),
    JSON.stringify(payload, null, 2) + '\n',
    { encoding: 'utf8', mode: 0o600 }
  )
}

/** Oldest first. A file that no longer parses is skipped, not thrown for. */
export async function readHeld(runId: string): Promise<HeldFinding[]> {
  const dir = join(heldDir(), runId)
  if (!existsSync(dir)) return []
  const held: HeldFinding[] = []
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.json')) continue
    const file = join(dir, name)
    try {
      held.push({ file, payload: JSON.parse(await readFile(file, 'utf8')) })
    } catch {
      continue
    }
  }
  return held.sort(
    (a, b) =>
      a.payload.reportedAt.localeCompare(b.payload.reportedAt) ||
      a.file.localeCompare(b.file)
  )
}

export async function dropHeld(held: HeldFinding[]): Promise<void> {
  for (const { file } of held) await rm(file, { force: true })
}
