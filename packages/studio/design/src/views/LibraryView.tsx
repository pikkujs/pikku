import { useEffect, useRef } from 'react'
import { libraryItems, findLibraryItem, renderStory, sectionItems } from '@/lib/discovery'
import type { LibraryItem } from '@/lib/discovery'
import { reportComponentMeta, useReportContentHeight } from '@/lib/host'
import { PreviewProvider } from '@/lib/PreviewProvider'
import { PreviewSurface } from '@/lib/PreviewSurface'
import { m } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// Library lens — the user's shadcn primitives, each rendered in all its variants
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
  previewCss,
  colorScheme,
}: {
  section: string | null
  previewCss: string
  colorScheme: 'light' | 'dark'
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const items = sectionItems(libraryItems, section)

  useReportContentHeight(containerRef, [section])
  useReportComponentMeta(findLibraryItem(section))

  if (libraryItems.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-col items-center py-8">
        <p className="text-sm text-[var(--app-text-faint)]">
          {m.view_no_stories()} <code>*.stories.tsx</code> {m.view_files_to()}{' '}
          <code>apps/*/src/components/</code>.
        </p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-8">
      {items.map((item) => (
        <div key={item.title} className="flex flex-col gap-4">
          <h4 className="text-base font-semibold text-[var(--app-text)]">{item.title}</h4>
          <div className="flex flex-col gap-6">
            {item.variants.map(({ name, story }, i) => (
              <div key={name} className="flex flex-col gap-3">
                {i > 0 && <hr className="border-[var(--app-border)]" />}
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--app-text-faint)]">
                  {name.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <div className="min-h-30">
                  <PreviewProvider css={previewCss} colorScheme={colorScheme}>
                    <PreviewSurface>{renderStory(story, item.component)}</PreviewSurface>
                  </PreviewProvider>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
