import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * What the person said about sending findings. `always` sends without asking,
 * `never` does nothing at all, and no saved answer means ask at hand-over.
 */
export type ReportConsent = 'always' | 'never'

/** One answer to the question: `yes` and `no` apply to what is held now only. */
export type ReportAnswer = 'yes' | 'no' | ReportConsent

export const REPORT_ANSWERS: ReportAnswer[] = ['yes', 'no', 'always', 'never']

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
