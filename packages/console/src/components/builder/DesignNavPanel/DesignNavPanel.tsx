import { Box } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { PikkuToggle } from '../PikkuToggle'
import type { DesignCatalog } from '../themeModel'
import type { DesignLens } from './types.js'
import { DESIGN_LENSES } from './constants.js'
import { NavRow } from './NavRow.js'
import { GroupLabel } from './GroupLabel.js'

function lensLabel(lens: DesignLens): string {
  return lens === 'app' ? m.design_lens_app() : m.design_lens_library()
}

function lensBlurb(lens: DesignLens): I18nNode {
  return lens === 'app' ? m.design_lens_app_blurb() : m.design_lens_library_blurb()
}

// Group an ordered list by a field, preserving first-seen order (mirrors the
// shell's own grouping so the two navs list identically).
function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const out: [string, T[]][] = []
  const index = new Map<string, number>()
  for (const item of items) {
    const group = key(item)
    if (!index.has(group)) {
      index.set(group, out.length)
      out.push([group, []])
    }
    out[index.get(group)!]![1].push(item)
  }
  return out
}

export function DesignNavPanel({
  lens,
  onLensChange,
  section,
  onSectionChange,
  catalog,
}: {
  lens: DesignLens
  onLensChange: (lens: DesignLens) => void
  /** The selected row's id, per lens (component title / file id). */
  section: string | null
  onSectionChange: (sectionId: string) => void
  catalog: DesignCatalog | null
}) {
  useLocale()

  const rows = () => {
    const entries = (lens === 'library' ? catalog?.library : catalog?.app) ?? []
    return groupBy(entries, (entry) => entry.group).map(([group, items]) => (
      <div key={group}>
        <GroupLabel>{asI18n(group)}</GroupLabel>
        {items.map((entry) => {
          const id = entry.key ?? entry.title
          return (
            <NavRow
              key={id}
              name={asI18n(entry.title)}
              testId={entry.title}
              selected={section === id}
              onClick={() => onSectionChange(id)}
            />
          )
        })}
      </div>
    ))
  }

  const body = rows()

  return (
    <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box style={{ padding: '10px 12px 6px' }}>
        <PikkuToggle
          value={lens}
          onChange={onLensChange}
          compact
          items={DESIGN_LENSES.map((entry) => ({
            value: entry.id,
            label: lensLabel(entry.id),
            icon: <entry.icon size={13} />,
            'data-testid': `design-lens-${entry.id}`,
          }))}
        />
        <Box style={{ fontSize: 11.5, color: 'var(--app-text-faint)', marginTop: 8 }}>
          {lensBlurb(lens)}
        </Box>
      </Box>
      <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px 12px' }}>
        {body.length > 0 ? (
          body
        ) : (
          <Box style={{ fontSize: 12, color: 'var(--app-text-faint)', padding: '10px 4px' }}>
            {m.design_nav_empty()}
          </Box>
        )}
      </Box>
    </Box>
  )
}
