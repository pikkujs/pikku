import { Select } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { supportedLocales } from '@/i18n/config'
import { usePreferences } from '@/contexts/preferences'

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  ar: 'العربية',
  zh: '中文',
  de: 'Deutsch',
}

export function LanguageSelector() {
  useLocale()
  const { locale, setLocale } = usePreferences()

  // A single-locale app has nothing to switch — showing a dead dropdown that
  // "does nothing" reads as broken. Only render once a second locale exists
  // (added via `fabric i18n --add-locale`, which registers it in settings.json).
  if (supportedLocales.length <= 1) return null

  const data = supportedLocales.map((code) => ({
    value: code,
    label: LOCALE_LABELS[code] ?? code.toUpperCase(),
  }))

  return (
    <Select
      aria-label={m.preferences__language()}
      data={data}
      value={locale}
      onChange={(v) => v && setLocale(v)}
      size="xs"
      w={110}
      allowDeselect={false}
    />
  )
}
