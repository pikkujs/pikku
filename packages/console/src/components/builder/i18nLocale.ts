/**
 * Locale-code helpers shared by the i18n editor. The validation regex mirrors
 * the orchestrator's `LOCALE_RE` (control.function.ts) so the console rejects
 * exactly the codes the backend would reject before a write is attempted.
 */

export const LOCALE_RE = /^[a-z]{2}([-_][A-Za-z]{2})?$/

export function isValidLocale(code: string): boolean {
  return LOCALE_RE.test(code)
}

export type Language = { code: string; name: string }

/**
 * Curated list of base languages offered in the locale picker — the user
 * chooses a language by name and we store its ISO 639-1 base code. Regional
 * sub-locales (e.g. `fr-CA`, `pt-BR`) are intentionally out of scope here and
 * tracked separately. Sorted by display name.
 */
export const LANGUAGES: Language[] = [
  { code: 'ar', name: 'Arabic' },
  { code: 'bn', name: 'Bengali' },
  { code: 'zh', name: 'Chinese' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fa', name: 'Persian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'es', name: 'Spanish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'vi', name: 'Vietnamese' },
]

/**
 * Right-to-left base languages present in LANGUAGES. A cell editing one of these
 * must set `dir="rtl"` or the text renders and the caret moves left-to-right —
 * the editor would show the translator something their app will never render.
 */
const RTL_LOCALES = new Set(['ar', 'fa', 'he', 'ur'])

export function localeDirection(code: string): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(code.slice(0, 2).toLowerCase()) ? 'rtl' : 'ltr'
}

/**
 * ICU placeholders (`{name}`, `{count}`) referenced by a message. A translation
 * whose set differs from the source's will interpolate wrong — or crash — at
 * runtime, so the editor compares the two and flags a divergence per cell.
 */
export function placeholdersIn(value: string): string[] {
  return [...value.matchAll(/\{([^{}\s]+)\}/g)].map((match) => match[1]).sort()
}

/**
 * Deep-clones a locale tree, replacing every leaf with an empty string. Used to
 * seed a freshly-added locale with the same key shape as an existing one, so
 * the editor renders an editable (blank) input at every token path — the
 * existing `writeLeaf` only navigates pre-existing structure, so a new locale
 * must carry the full key shape or edits silently no-op.
 */
export function emptyLocaleFrom(reference: unknown): unknown {
  if (reference === null || typeof reference !== 'object') return ''
  if (Array.isArray(reference)) return reference.map(emptyLocaleFrom)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(reference)) {
    out[key] = emptyLocaleFrom(value)
  }
  return out
}
