import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EMAIL_CATALOG, type EmailCatalogEntry } from './catalog.js'

export { EMAIL_CATALOG, type EmailCatalogEntry } from './catalog.js'

export interface AddCatalogEmailResult {
  name: string
  written: string[]
  skipped: string[]
  localeFile: string
  localeKeysAdded: string[]
}

/** The catalogue entry whose name or locale key matches, case-insensitively. */
export function findCatalogEmail(name: string): EmailCatalogEntry | undefined {
  const wanted = name.trim().toLowerCase()
  return EMAIL_CATALOG.find(
    (entry) =>
      entry.name.toLowerCase() === wanted ||
      entry.templateKey.toLowerCase() === wanted
  )
}

const readJson = (path: string): Record<string, unknown> => {
  if (!existsSync(path)) return {}
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object`)
  }
  return parsed as Record<string, unknown>
}

/** Copies a catalogue email into `emailsDir/templates` and adds its copy to the base locale, keeping anything already there unless `force`. */
export function addCatalogEmail(
  emailsDir: string,
  name: string,
  options: { force?: boolean; locale?: string } = {}
): AddCatalogEmailResult {
  const entry = findCatalogEmail(name)
  if (!entry) {
    throw new Error(
      `No catalogue email named "${name}". Available: ${EMAIL_CATALOG.map((e) => e.name).join(', ')}`
    )
  }

  const templatesDir = join(emailsDir, 'templates')
  mkdirSync(templatesDir, { recursive: true })
  const written: string[] = []
  const skipped: string[] = []
  for (const [file, content] of Object.entries(entry.source)) {
    const path = join(templatesDir, file)
    if (existsSync(path) && !options.force) {
      skipped.push(path)
      continue
    }
    writeFileSync(path, content, 'utf8')
    written.push(path)
  }

  const localeFile = join(
    emailsDir,
    'locales',
    `${options.locale ?? 'en'}.json`
  )
  const locale = readJson(localeFile)
  const localeKeysAdded: string[] = []
  for (const [key, block] of Object.entries(entry.locale)) {
    const current =
      locale[key] && typeof locale[key] === 'object'
        ? (locale[key] as Record<string, unknown>)
        : {}
    const merged: Record<string, unknown> = { ...current }
    for (const [field, value] of Object.entries(block)) {
      if (field in current && !options.force) continue
      merged[field] = value
      localeKeysAdded.push(`${key}.${field}`)
    }
    locale[key] = merged
  }
  if (localeKeysAdded.length > 0) {
    mkdirSync(join(emailsDir, 'locales'), { recursive: true })
    writeFileSync(localeFile, `${JSON.stringify(locale, null, 2)}\n`, 'utf8')
  }

  return { name: entry.name, written, skipped, localeFile, localeKeysAdded }
}
