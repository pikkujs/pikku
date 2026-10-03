import type { FC } from 'react'
import { ActionIcon, Box, useMantineColorScheme } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export const SunGlyph = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
)

export const MoonGlyph = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
)

export const ColorSchemeToggle: FC = () => {
  useLocale()
  const { toggleColorScheme } = useMantineColorScheme()

  return (
    <ActionIcon
      variant="default"
      size={30}
      aria-label={m.preferences__color_scheme()}
      onClick={toggleColorScheme}
    >
      <Box component="span" lh={0} lightHidden>
        <SunGlyph />
      </Box>
      <Box component="span" lh={0} darkHidden>
        <MoonGlyph />
      </Box>
    </ActionIcon>
  )
}
