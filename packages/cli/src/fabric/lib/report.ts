import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ReportEnvironment } from './report-environment.js'

/**
 * What the person said about sending build reports. `always` sends without
 * asking, `never` does nothing at all, and no saved answer means ask.
 */
export type ReportConsent = 'always' | 'never'

/** One answer to the question: `yes` and `no` apply to this report only. */
export type ReportAnswer = 'yes' | 'no' | ReportConsent

export const REPORT_ANSWERS: ReportAnswer[] = ['yes', 'no', 'always', 'never']

/** A build report is prose; anything past this is a log dump, not a report. */
export const REPORT_MAX_BYTES = 200_000

export function consentFile(): string {
  return (
    process.env.FABRIC_REPORT_CONSENT_FILE ??
    join(homedir(), '.fabric', 'report-consent.json')
  )
}

/**
 * Consent belongs to the person, so it lives on their machine rather than in
 * a project config that is committed and shared. `PIKKU_REPORT` overrides it
 * for CI and sandboxes, where there is no one to ask.
 */
export async function readConsent(): Promise<ReportConsent | null> {
  const fromEnv = process.env.PIKKU_REPORT
  if (fromEnv === 'always' || fromEnv === 'never') return fromEnv
  const file = consentFile()
  if (!existsSync(file)) return null
  try {
    const { consent } = JSON.parse(await readFile(file, 'utf8'))
    return consent === 'always' || consent === 'never' ? consent : null
  } catch {
    return null
  }
}

export async function saveConsent(consent: ReportConsent): Promise<void> {
  const file = consentFile()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(
    file,
    JSON.stringify({ consent, savedAt: new Date().toISOString() }, null, 2) +
      '\n',
    { encoding: 'utf8', mode: 0o600 }
  )
}

export function parseAnswer(value: string): ReportAnswer | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'y') return 'yes'
  if (normalized === 'n') return 'no'
  if (normalized === 'a') return 'always'
  if (normalized === 'v') return 'never'
  return (REPORT_ANSWERS as string[]).includes(normalized)
    ? (normalized as ReportAnswer)
    : null
}

export interface ReportPayload {
  report: string
  environment: ReportEnvironment
  reportedAt: string
}

/**
 * The card shown before anything leaves the machine: what would be sent and
 * where. Printed whether the answer comes from a prompt, a flag or a saved
 * `always`, so the terminal always records what went out.
 */
export function renderCard(opts: {
  file: string
  payload: ReportPayload
  apiUrl: string
}): string {
  const { environment, report } = opts.payload
  const entries = report.split('\n').filter((l) => /^#{2,3}\s/.test(l)).length
  const pikku = environment.packages.find((p) => p.name === '@pikku/cli')
  return [
    '[fabric] build report',
    `  file: ${opts.file} (${Buffer.byteLength(report)} bytes${entries ? `, ${entries} ${entries === 1 ? 'entry' : 'entries'}` : ''})`,
    `  with: pikku ${pikku?.version ?? 'unknown'}, node ${environment.node}, ${environment.packageManager ?? 'unknown package manager'}, ${environment.platform}`,
    `  to:   ${opts.apiUrl}/reports`,
    '  Nothing else is sent: no project, no account, no code.',
  ].join('\n')
}

export async function postReport(opts: {
  apiUrl: string
  payload: ReportPayload
  timeoutMs?: number
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const response = await fetch(`${opts.apiUrl}/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts.payload),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    })
    if (!response.ok) {
      return { sent: false, reason: `fabric answered ${response.status}` }
    }
    return { sent: true }
  } catch (error: any) {
    return { sent: false, reason: error?.message ?? 'request failed' }
  }
}
