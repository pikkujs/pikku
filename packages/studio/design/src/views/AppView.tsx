import { useEffect, useRef } from 'react'
import { Box, Group, Stack, Text, Title } from '@mantine/core'
import type { MantineThemeOverride } from '@mantine/core'
import { appItems, findAppItem, renderStory, sectionItems } from '@/lib/discovery'
import type { AppItem, AppScenario } from '@/lib/discovery'
import { reportComponentMeta, useReportContentHeight } from '@/lib/host'
import { PreviewProvider } from '@/lib/PreviewProvider'
import { PreviewSurface } from '@/lib/PreviewSurface'
import { m } from '@/lib/i18n'

type PreviewProps = {
  previewTheme: MantineThemeOverride
  colorScheme: 'light' | 'dark'
}

// ─────────────────────────────────────────────────────────────────────────────
// App lens — app-level widgets composed from the library, each rendered across
// its NAMED data-state scenarios (Loading / Error / Empty / Ready, etc.). Unlike
// the old template this is fully glob-discovered (no hardcoded UserCard, no AI
// sync): a widget is any `*.app.stories.tsx`, its named exports are the scenarios,
// each carrying an optional `tag` like "userQuery: pending".
// ─────────────────────────────────────────────────────────────────────────────

// One named scenario in its own labelled frame, matching the design's ScenarioFrame.
function ScenarioFrame({
  scenario,
  previewTheme,
  colorScheme,
}: { scenario: AppScenario } & PreviewProps) {
  return (
    <Stack gap={6}>
      <Group gap={10} align="baseline">
        <Text size="xs" fw={700} tt="uppercase" style={{ letterSpacing: '0.05em' }}>
          {scenario.name.replace(/([A-Z])/g, ' $1').trim()}
        </Text>
        {scenario.tag && (
          <Text size="xs" c="dimmed" ff="monospace">
            {scenario.tag}
          </Text>
        )}
      </Group>
      {/* The box is the USER theme's page, not console chrome — a widget with a
          transparent surface rendered straight onto the console's page card was
          unreadable, which is what this replaces. It carries the user's own body
          colour and border, so it still isn't a card in a card. */}
      <Box style={{ width: '100%', minWidth: 0 }}>
        <PreviewProvider theme={previewTheme} colorScheme={colorScheme}>
          <PreviewSurface>{renderStory(scenario.story, scenario.component)}</PreviewSurface>
        </PreviewProvider>
      </Box>
    </Stack>
  )
}

function WidgetScenarios({ item, previewTheme, colorScheme }: { item: AppItem } & PreviewProps) {
  return (
    <Stack gap="md" maw={720}>
      <Stack gap={2}>
        <Title order={4}>{item.title}</Title>
        {item.description && (
          <Text size="sm" c="dimmed">
            {item.description}
          </Text>
        )}
      </Stack>
      <Stack gap="md">
        {item.scenarios.map((scenario) => (
          <ScenarioFrame
            key={scenario.name}
            scenario={scenario}
            previewTheme={previewTheme}
            colorScheme={colorScheme}
          />
        ))}
      </Stack>
    </Stack>
  )
}

// Emit component-meta (incl. the widget's query/mutation inputs) on selection.
function useReportComponentMeta(item: AppItem | null) {
  useEffect(() => {
    if (!item) return
    reportComponentMeta({
      title: item.title,
      tags: [],
      argTypes: item.argTypes,
      inputs: item.inputs,
    })
  }, [item])
}

export function AppView({
  section,
  previewTheme,
  colorScheme,
}: { section: string | null } & PreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const items = sectionItems(appItems, section)

  useReportContentHeight(containerRef, [section])
  useReportComponentMeta(findAppItem(section))

  if (appItems.length === 0) {
    return (
      <Stack ref={containerRef} py="xl" align="center">
        <Text c="dimmed" size="sm">
          {m.view_no_widgets()} <code>*.app.stories.tsx</code> {m.view_files_to()}{' '}
          <code>packages/components/src/</code>.
        </Text>
      </Stack>
    )
  }

  return (
    <Stack ref={containerRef} gap="xl">
      {items.map((item) => (
        <WidgetScenarios
          key={item.title}
          item={item}
          previewTheme={previewTheme}
          colorScheme={colorScheme}
        />
      ))}
    </Stack>
  )
}
