import { LANGUAGES } from '../i18nLocale'

export function getLanguageLabel(code: string): string {
  const match = LANGUAGES.find((l) => l.code === code)
  return match ? match.name : code
}
