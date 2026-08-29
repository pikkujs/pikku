import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { postFinding, type FindingPayload } from './finding.js'

/**
 * A finding that could not be sent when it was filed, held until it can be.
 *
 * The cases that keep a finding from leaving — no token, no linked project, a
 * fabric that is down — are the same cases the finding is most likely to be
 * about: a scaffold that never got far enough to log in is exactly the thing
 * worth hearing about, and printing it and dropping it loses it. The spool
 * lives in `~/.fabric`, not the repo, so nothing goes stale on an abandoned
 * branch and git never sees it.
 */
export interface SpooledFinding {
  file: string
  spooledAt: string
  reason: string
  projectId: string | null
  payload: FindingPayload
}

/** Oldest entries past this are dropped, so a logged-out machine stays bounded. */
export const SPOOL_LIMIT = 100

export function spoolDir(): string {
  return (
    process.env.FABRIC_FINDINGS_DIR ?? join(homedir(), '.fabric', 'findings')
  )
}

export async function spoolFinding(entry: {
  payload: FindingPayload
  reason: string
  projectId: string | null
}): Promise<string> {
  const dir = spoolDir()
  await mkdir(dir, { recursive: true })
  const stamp = entry.payload.reportedAt.replace(/[:.]/g, '-')
  const file = join(dir, `${stamp}-${randomBytes(3).toString('hex')}.json`)
  await writeFile(
    file,
    JSON.stringify(
      {
        spooledAt: new Date().toISOString(),
        reason: entry.reason,
        projectId: entry.projectId,
        payload: entry.payload,
      },
      null,
      2
    ) + '\n',
    { encoding: 'utf8', mode: 0o600 }
  )
  await pruneSpool()
  return file
}

/**
 * Chronological, by the timestamp inside each finding rather than the one its
 * name carries — the name is for a human reading the directory, and ordering
 * the queue by it would make the send order a property of how a filename
 * happens to sort. A file that no longer parses is skipped rather than thrown
 * for: one corrupt entry is not a reason to lose the rest, or to fail the
 * command that happened to notice.
 */
export async function readSpool(): Promise<SpooledFinding[]> {
  const dir = spoolDir()
  if (!existsSync(dir)) return []
  const names = (await readdir(dir)).filter((n) => n.endsWith('.json'))
  const entries: SpooledFinding[] = []
  for (const name of names) {
    const file = join(dir, name)
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      if (!parsed?.payload) continue
      entries.push({
        file,
        spooledAt: parsed.spooledAt ?? '',
        reason: parsed.reason ?? 'unknown',
        projectId: parsed.projectId ?? null,
        payload: parsed.payload as FindingPayload,
      })
    } catch {
      continue
    }
  }
  return entries.sort(
    (a, b) =>
      a.payload.reportedAt.localeCompare(b.payload.reportedAt) ||
      a.file.localeCompare(b.file)
  )
}

export async function clearSpool(): Promise<number> {
  const entries = await readSpool()
  for (const entry of entries) await rm(entry.file, { force: true })
  return entries.length
}

async function pruneSpool(): Promise<void> {
  const entries = await readSpool()
  const excess = Math.max(0, entries.length - SPOOL_LIMIT)
  for (const entry of entries.slice(0, excess)) {
    await rm(entry.file, { force: true })
  }
}

export interface FlushResult {
  sent: number
  remaining: number
  reason?: string
}

/**
 * Drain the spool oldest-first, stopping at the first entry fabric does not
 * accept — a refusal usually means the next one will be refused too, and
 * hammering an endpoint that just said no is the wrong thing for a command
 * whose real job is something else.
 *
 * An entry keeps the project it was filed against; only one spooled before the
 * repo was linked adopts the project linked now.
 */
export async function flushSpool(ctx: {
  apiUrl: string
  token: string
  projectId: string | null
}): Promise<FlushResult> {
  const entries = await readSpool()
  let sent = 0
  for (const [index, entry] of entries.entries()) {
    const projectId = entry.projectId ?? ctx.projectId
    if (!projectId) {
      return {
        sent,
        remaining: entries.length - sent,
        reason: 'no project linked',
      }
    }
    const result = await postFinding({
      apiUrl: ctx.apiUrl,
      token: ctx.token,
      projectId,
      payload: entry.payload,
    })
    if (!result.sent) {
      return {
        sent,
        remaining: entries.length - index,
        reason: result.reason,
      }
    }
    await rm(entry.file, { force: true })
    sent++
  }
  return { sent, remaining: 0 }
}
