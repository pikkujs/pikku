import { Select } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { themeList } from '@project/mantine-themes'
import { usePreferences } from '@/contexts/preferences'

// A single theme per app. Themes are normally chosen from the Fabric console
// (which live-injects into the iframe); this picker only appears when more than
// one theme ships, and is hidden otherwise.
export function ThemeSelector() {
  useLocale()
  const { themeId, setThemeId } = usePreferences()

  if (themeList.length <= 1) return null

  return (
    <Select
      aria-label={m.preferences__theme()}
      data={themeList.map((t) => ({ value: t.id, label: t.name }))}
      value={themeId}
      onChange={(v) => v && setThemeId(v)}
      size="xs"
      w={110}
      allowDeselect={false}
    />
  )
}
