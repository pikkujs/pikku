import { useEffect, useRef } from 'react'
import { Box, Divider, Stack, Text, Title } from '@mantine/core'
import type { MantineThemeOverride } from '@mantine/core'
import { libraryItems, findLibraryItem, renderStory, sectionItems } from '@/lib/discovery'
import type { LibraryItem } from '@/lib/discovery'
import { reportComponentMeta, useReportContentHeight } from '@/lib/host'
import { PreviewProvider } from '@/lib/PreviewProvider'
import { PreviewSurface } from '@/lib/PreviewSurface'
import { m } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// Library lens — the user's Mantine primitives, each rendered in all its variants
// under the active theme. The console drives `section` (the component title) via
// set-section; with no selection we show the whole library.
// ─────────────────────────────────────────────────────────────────────────────

// Emit component-meta when the selected library component changes (or clears) so
// the console's right-column inspector tracks the centre preview.
function useReportComponentMeta(item: LibraryItem | null) {
  useEffect(() => {
    if (!item) return
    reportComponentMeta({
      title: item.title,
      tags: item.tags,
      argTypes: item.argTypes,
    })
  }, [item])
}

export function LibraryView({
  section,
  previewTheme,
  colorScheme,
}: {
  section: string | null
  previewTheme: MantineThemeOverride
  colorScheme: 'light' | 'dark'
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const items = sectionItems(libraryItems, section)

  useReportContentHeight(containerRef, [section])
  useReportComponentMeta(findLibraryItem(section))

  if (libraryItems.length === 0) {
    return (
      <Stack ref={containerRef} py="xl" align="center">
        <Text c="dimmed" size="sm">
          {m.view_no_stories()} <code>*.stories.tsx</code> {m.view_files_to()}{' '}
          <code>packages/components/src/</code>.
        </Text>
      </Stack>
    )
  }

  return (
    <Stack ref={containerRef} gap="xl">
      {items.map((item) => (
        <Stack key={item.title} gap="md">
          <Title order={4}>{item.title}</Title>
          <Stack gap="lg">
            {item.variants.map(({ name, story }, i) => (
              <Stack key={name} gap="sm">
                {i > 0 && <Divider />}
                <Text
                  size="xs"
                  c="dimmed"
                  tt="uppercase"
                  fw={500}
                  style={{ letterSpacing: '0.05em' }}
                >
                  {name.replace(/([A-Z])/g, ' $1').trim()}
                </Text>
                <Box style={{ minHeight: 120 }}>
                  <PreviewProvider theme={previewTheme} colorScheme={colorScheme}>
                    <PreviewSurface>{renderStory(story, item.component)}</PreviewSurface>
                  </PreviewProvider>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Stack>
      ))}
    </Stack>
  )
}
