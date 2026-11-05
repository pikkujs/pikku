import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { I18nService, MISSING_MARKER } from '@pikku/code-edit/i18n'
import type { ValidateFinding } from './virtual-user-checks.js'

/** An app with an inlang project — the only place translations are checked. */
export const hasInlangProject = (dir: string): boolean =>
  existsSync(join(dir, 'project.inlang', 'settings.json'))

const list = (keys: string[]): string => {
  const shown = keys.slice(0, 5).join(', ')
  return keys.length > 5 ? `${shown} … (+${keys.length - 5} more)` : shown
}

/**
 * Every language the app serves must be fully translated.
 *
 * "Serves" means listed in `project.inlang/settings.json` `locales`: that is
 * what Paraglide compiles and what answers under `/<lang>`. A `messages/<lang>.json`
 * that is not listed is a draft nobody can reach, so it is left alone.
 */
export const runI18nChecks = async (
  dir: string
): Promise<ValidateFinding[]> => {
  const findings: ValidateFinding[] = []
  const reports = await new I18nService(dir).check('.')
  for (const report of reports) {
    const live = new Set(report.liveLocales)
    live.delete(report.baseLocale)
    const add = (
      id: string,
      catalog: string,
      locale: string,
      message: string,
      fixHint: string
    ) =>
      findings.push({
        id,
        severity: 'error',
        message: `${locale} is live but ${message}`,
        path: catalog,
        fixHint,
      })
    for (const d of report.duplicates)
      findings.push({
        id: 'i18n-duplicate-key',
        severity: 'error',
        message: `message key ${d.key} is defined in more than one catalog: ${d.catalogs.join(', ')}`,
        path: d.catalogs[0] ?? '.',
        fixHint: 'Keep the key in one catalog and delete the others',
      })
    for (const c of report.catalogs) {
      for (const m of c.missing)
        if (live.has(m.locale))
          add(
            'i18n-missing-translation',
            c.catalog,
            m.locale,
            `lacks ${m.keys.length} key(s) from ${report.baseLocale}: ${list(m.keys)}`,
            `Run \`pikku i18n sync\`, translate the new keys in ${m.locale}.json, or remove ${m.locale} from project.inlang/settings.json locales`
          )
      for (const [locale, n] of Object.entries(c.untranslated))
        if (live.has(locale))
          add(
            'i18n-untranslated',
            c.catalog,
            locale,
            `${n} value(s) are still marked ${MISSING_MARKER}`,
            `Translate the values marked ${MISSING_MARKER} in ${locale}.json (\`pikku i18n check\` lists them), or remove ${locale} from settings locales`
          )
      for (const p of c.placeholders)
        if (live.has(p.locale))
          add(
            'i18n-placeholder-mismatch',
            c.catalog,
            p.locale,
            `${p.key} has placeholders {${p.found.join(', ')}} where ${report.baseLocale} has {${p.base.join(', ')}}`,
            `Make ${p.key} in ${p.locale}.json use the same {placeholders} as ${report.baseLocale}`
          )
      for (const p of c.plural)
        if (live.has(p.locale) && p.problem !== 'missing-category')
          add(
            'i18n-plural-invalid',
            c.catalog,
            p.locale,
            p.problem === 'missing-other'
              ? `${p.key}: plural ${p.selector} has no "other" variant`
              : `${p.key}: plural ${p.selector} uses ${p.categories.join(', ')}, which ${p.locale} does not have`,
            `Fix the variant block of ${p.key} in ${p.locale}.json`
          )
      for (const s of c.stale)
        if (live.has(s.locale))
          add(
            'i18n-stale-key',
            c.catalog,
            s.locale,
            `holds ${s.keys.length} key(s) not in ${report.baseLocale}: ${list(s.keys)}`,
            `Delete them from ${s.locale}.json (\`pikku i18n sync\` reports them)`
          )
    }
  }
  return findings
}
