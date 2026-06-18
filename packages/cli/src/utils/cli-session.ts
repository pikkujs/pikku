import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'

/**
 * A locally-persisted CLI session obtained via `pikku login` (the better-auth
 * device-authorization flow). Stored at `~/.pikku/session.json`, keyed by the
 * server's base URL so a single user can be logged into multiple pikku servers.
 *
 * `accessToken` is a better-auth session token — present it as
 * `Authorization: Bearer <accessToken>` (requires the `bearer` plugin on the
 * server). This is the HUMAN path; machine agents use scoped API keys
 * (`x-api-key`) instead and never read this file.
 */
export interface PikkuCliSession {
  baseURL: string
  accessToken: string
  tokenType: string
  /** ISO timestamp; absent when the server did not report an expiry. */
  expiresAt?: string
  user?: { id: string; email?: string | null; name?: string | null }
  obtainedAt: string
}

interface SessionFile {
  /** Sessions keyed by normalized base URL. */
  sessions: Record<string, PikkuCliSession>
  /** Most-recently used base URL — the default target when none is given. */
  current?: string
}

const SESSION_DIR = join(homedir(), '.pikku')
const SESSION_FILE = join(SESSION_DIR, 'session.json')

export const sessionFilePath = (): string => SESSION_FILE

/** Drop a trailing slash so `https://x/` and `https://x` share one entry. */
export const normalizeBaseURL = (url: string): string =>
  url.trim().replace(/\/+$/, '')

const readSessionFile = async (): Promise<SessionFile> => {
  if (!existsSync(SESSION_FILE)) {
    return { sessions: {} }
  }
  try {
    const parsed = JSON.parse(await readFile(SESSION_FILE, 'utf-8'))
    return { sessions: parsed.sessions ?? {}, current: parsed.current }
  } catch {
    // Corrupt file — treat as empty rather than crashing every command.
    return { sessions: {} }
  }
}

const writeSessionFile = async (file: SessionFile): Promise<void> => {
  await mkdir(dirname(SESSION_FILE), { recursive: true })
  // 0600 — the file holds bearer tokens.
  await writeFile(SESSION_FILE, JSON.stringify(file, null, 2), { mode: 0o600 })
}

/** Persist a session and mark it the current default target. */
export const saveSession = async (
  session: PikkuCliSession
): Promise<string> => {
  const file = await readSessionFile()
  const key = normalizeBaseURL(session.baseURL)
  file.sessions[key] = { ...session, baseURL: key }
  file.current = key
  await writeSessionFile(file)
  return SESSION_FILE
}

/**
 * Load a stored session. With no `baseURL`, returns the current default. Returns
 * `null` if none is stored.
 */
export const loadSession = async (
  baseURL?: string
): Promise<PikkuCliSession | null> => {
  const file = await readSessionFile()
  const key = baseURL ? normalizeBaseURL(baseURL) : file.current
  if (!key) {
    return null
  }
  return file.sessions[key] ?? null
}

/**
 * Remove a stored session (the given one, or the current default). Returns the
 * base URL that was removed, or `null` if nothing matched.
 */
export const clearSession = async (
  baseURL?: string
): Promise<string | null> => {
  const file = await readSessionFile()
  const key = baseURL ? normalizeBaseURL(baseURL) : file.current
  if (!key || !file.sessions[key]) {
    return null
  }
  delete file.sessions[key]
  if (file.current === key) {
    file.current = Object.keys(file.sessions)[0]
  }
  if (Object.keys(file.sessions).length === 0) {
    // Nothing left — remove the file entirely rather than leaving an empty husk.
    await rm(SESSION_FILE, { force: true })
  } else {
    await writeSessionFile(file)
  }
  return key
}

/** True when the session has a known expiry that is in the past. */
export const isSessionExpired = (
  session: PikkuCliSession,
  nowMs: number = Date.now()
): boolean =>
  session.expiresAt ? new Date(session.expiresAt).getTime() <= nowMs : false
