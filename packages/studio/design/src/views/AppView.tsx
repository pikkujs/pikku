import { useEffect, useRef } from 'react'
import { appItems, findAppItem, renderStory, sectionItems } from '@/lib/discovery'
import type { AppItem, AppScenario } from '@/lib/discovery'
import { reportComponentMeta, useReportContentHeight } from '@/lib/host'
import { PreviewProvider } from '@/lib/PreviewProvider'
import { PreviewSurface } from '@/lib/PreviewSurface'
import { m } from '@/lib/i18n'

type PreviewProps = {
  previewCss: string
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
  previewCss,
  colorScheme,
}: { scenario: AppScenario } & PreviewProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--app-text)]">
          {scenario.name.replace(/([A-Z])/g, ' $1').trim()}
        </span>
        {scenario.tag && (
          <span className="font-mono text-xs text-[var(--app-text-faint)]">{scenario.tag}</span>
        )}
      </div>
      {/* The box is the USER theme's page, not console chrome — a widget with a
          transparent surface rendered straight onto the console's page card was
          unreadable, which is what this replaces. It carries the user's own body
          colour and border, so it still isn't a card in a card. */}
      <div className="w-full min-w-0">
        <PreviewProvider css={previewCss} colorScheme={colorScheme}>
          <PreviewSurface>{renderStory(scenario.story, scenario.component)}</PreviewSurface>
        </PreviewProvider>
      </div>
    </div>
  )
}

function WidgetScenarios({ item, previewCss, colorScheme }: { item: AppItem } & PreviewProps) {
  return (
    <div className="flex max-w-180 flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h4 className="text-base font-semibold text-[var(--app-text)]">{item.title}</h4>
        {item.description && (
          <p className="text-sm text-[var(--app-text-faint)]">{item.description}</p>
        )}
      </div>
      <div className="flex flex-col gap-4">
        {item.scenarios.map((scenario) => (
          <ScenarioFrame
            key={scenario.name}
            scenario={scenario}
            previewCss={previewCss}
            colorScheme={colorScheme}
          />
        ))}
      </div>
    </div>
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
  previewCss,
  colorScheme,
}: { section: string | null } & PreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const items = sectionItems(appItems, section)

  useReportContentHeight(containerRef, [section])
  useReportComponentMeta(findAppItem(section))

  if (appItems.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-col items-center py-8">
        <p className="text-sm text-[var(--app-text-faint)]">
          {m.view_no_widgets()} <code>*.app.stories.tsx</code> {m.view_files_to()}{' '}
          <code>apps/*/src/components/</code>.
        </p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-8">
      {items.map((item) => (
        <WidgetScenarios
          key={item.title}
          item={item}
          previewCss={previewCss}
          colorScheme={colorScheme}
        />
      ))}
    </div>
  )
}
