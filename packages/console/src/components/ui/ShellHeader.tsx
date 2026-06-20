import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ActionIcon,
  Box,
  Collapse,
  Group,
  Indicator,
  Paper,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@pikku/mantine/core'
import { useElementSize } from '@mantine/hooks'
import { useI18n } from '@pikku/react/i18n'
import { ListFilter, Search } from 'lucide-react'
import { PikkuSwitch } from './PikkuSwitch'
import { FilterChip } from './FilterChip'
import { CycleSwitch } from './CycleSwitch'
import { ActionCluster } from './ActionCluster'
import {
  CONTROL_H,
  GAP,
  SAFETY,
  filterDisplay,
  partitionFilters,
  type Candidate,
  type ShellHeaderProps,
} from './shellHeaderShared'

export type {
  ShellHeaderProps,
  ShellHeaderSelection,
  ShellHeaderFilter,
  ShellHeaderFilterOption,
  ShellHeaderSearch,
  ShellHeaderAction,
} from './shellHeaderShared'

/* ============================================================================
   ShellHeader — one compact bar that replaces the tall title + action-bar
   block: selection on the left, filters in the middle, actions on the right.
   Filters that don't fit collapse behind a funnel that slides them down as a
   second toolbar row (the text search is the last to collapse); action labels
   fold to icons; the selection switch becomes a single cycling button, then
   folds into the row too, when narrow. All measured, not breakpointed.
   Props-only: every label/value is passed already-translated by the caller.
   ========================================================================== */

export const ShellHeader = <T extends string = string>({
  title,
  count,
  selection,
  filters = [],
  search,
  actions = [],
  actionsNode,
  filtersTitle,
}: ShellHeaderProps<T>) => {
  const { t } = useI18n()
  const filtersLabel = filtersTitle ?? t('shell_header.filters')
  const { ref: sizeRef, width } = useElementSize()
  const measRef = useRef<Record<string, HTMLElement | null>>({})
  const [w, setW] = useState<Record<string, number> | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const searchWidth = search?.width ?? 220

  // Re-measure whenever the content that affects natural widths changes.
  const sig = JSON.stringify({
    title: title != null,
    count: count != null,
    sel: selection?.options.map((o) => o.value),
    selVal: selection?.value,
    filters: filters.map((f) => [f.key, f.label, filterDisplay(f), !!f.icon]),
    search: search ? [search.placeholder, searchWidth] : null,
    actions: actions.map((a) => [a.key, a.label, !!a.icon, a.variant]),
    actNode: actionsNode != null,
  })
  useLayoutEffect(() => {
    const m: Record<string, number> = {}
    for (const [id, el] of Object.entries(measRef.current)) {
      if (el) m[id] = el.getBoundingClientRect().width
    }
    setW(m)
  }, [sig])

  // Build collapse candidates richest → poorest; pick the first that fits.
  const F = filters.length
  const base = (over: Partial<Candidate>): Candidate => ({
    showTitle: false,
    showCount: false,
    selMode: 'switch',
    visCount: F,
    searchInline: true,
    actMode: 'label',
    ...over,
  })
  // The whole text stack collapses first, as a unit: title goes, then the
  // count/description, leaving no text at all before any control degrades.
  const candidates: Candidate[] = []
  if (title != null) candidates.push(base({ showTitle: true, showCount: count != null }))
  if (count != null) candidates.push(base({ showCount: true }))
  candidates.push(base({ actMode: 'label' }))
  candidates.push(base({ actMode: 'icon' }))
  for (let n = F - 1; n >= 0; n--) {
    candidates.push(base({ visCount: n, actMode: 'icon' }))
  }
  if (search) {
    candidates.push(base({ visCount: 0, searchInline: false, actMode: 'icon' }))
    candidates.push(base({ selMode: 'cycle', visCount: 0, searchInline: false, actMode: 'icon' }))
  } else {
    candidates.push(base({ selMode: 'cycle', visCount: 0, actMode: 'icon' }))
  }
  candidates.push(base({ selMode: 'cycle', visCount: 0, searchInline: !search, actMode: 'compact' }))
  // Mobile tier: the selection/view toggle also folds into the drawer, leaving
  // the bar as just the funnel icon (+ actions) and the drawer as the catch-all.
  if (selection) {
    candidates.push(base({ selMode: 'drawer', visCount: 0, searchInline: false, actMode: 'icon' }))
    candidates.push(base({ selMode: 'drawer', visCount: 0, searchInline: false, actMode: 'compact' }))
  }

  const measure = (id: string) => (w?.[id] ?? 0)
  const candWidth = (c: Candidate): number => {
    const { visible, hidden } = partitionFilters(filters, c.visCount)
    const selInDrawer = !!selection && c.selMode === 'drawer'
    const showFunnel = hidden.length > 0 || (!!search && !c.searchInline) || selInDrawer
    const parts: number[] = []
    // title + count are stacked in a column; the block is as wide as the wider of the two.
    const titleBlock = Math.max(
      c.showTitle && title != null ? measure('title') : 0,
      c.showCount && count != null ? measure('count') : 0,
    )
    if (titleBlock > 0) parts.push(titleBlock)
    if (selection && !selInDrawer) parts.push(measure(c.selMode === 'switch' ? 'selSwitch' : 'selCycle'))
    visible.forEach((f) => parts.push(measure('filter:' + f.key)))
    if (showFunnel) parts.push(measure('funnel'))
    if (search && c.searchInline) parts.push(measure('search'))
    if (actions.length) {
      parts.push(measure(c.actMode === 'label' ? 'actLabel' : c.actMode === 'icon' ? 'actIcon' : 'actCompact'))
    }
    if (actionsNode != null) parts.push(measure('actNode'))
    const used = parts.filter((p) => p > 0)
    // selection carries an extra marginLeft (GAP) for right-side separation.
    const extra = selection && !selInDrawer ? GAP : 0
    return used.reduce((s, p) => s + p, 0) + GAP * Math.max(0, used.length - 1) + extra + SAFETY
  }

  let chosen = candidates[0]!
  if (w && width > 0) {
    chosen = candidates.find((c) => candWidth(c) <= width) ?? candidates[candidates.length - 1]!
  }

  // Icon-less switches must show every label (the default only labels the active
  // option, relying on icons to distinguish the rest).
  const switchShowAllLabels = !!selection && !selection.options.some((o) => o.icon)

  const { visible, hidden } = partitionFilters(filters, chosen.visCount)
  const searchInline = chosen.searchInline && !!search
  const selectionInDrawer = !!selection && chosen.selMode === 'drawer'
  const hiddenCount = hidden.length + (search && !searchInline ? 1 : 0)
  const showFunnel = hiddenCount > 0 || selectionInDrawer

  const searchField = search ? (
    <TextInput
      placeholder={search.placeholder}
      leftSection={<Search size={14} />}
      value={search.value}
      onChange={(e) => search.onChange(e.currentTarget.value)}
      w={searchWidth}
      size="sm"
      styles={{ root: { flexShrink: 0 }, input: { height: CONTROL_H, minHeight: CONTROL_H } }}
    />
  ) : null

  const measureNode = (id: string, node: ReactNode) => (
    <div ref={(el) => void (measRef.current[id] = el)} style={{ flex: '0 0 auto' }}>
      {node}
    </div>
  )

  return (
    <>
      <Paper
        radius={0}
        py={0}
        px="xl"
        h={45}
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
      <Group
        ref={sizeRef}
        wrap="nowrap"
        gap={GAP}
        align="center"
        justify="space-between"
        w="100%"
        style={{ minWidth: 0 }}
      >
        {((chosen.showTitle && title != null) || (chosen.showCount && count != null)) && (
          <Stack gap={2} justify="center" style={{ flexShrink: 0, minWidth: 0 }}>
            {chosen.showTitle && title != null && (
              <Text component="div" fz="sm" fw={600} lh={1.2} style={{ whiteSpace: 'nowrap' }}>
                {title}
              </Text>
            )}
            {chosen.showCount && count != null && (
              <Text component="div" fz="xs" c="dimmed" lh={1.2} style={{ whiteSpace: 'nowrap' }}>
                {count}
              </Text>
            )}
          </Stack>
        )}

        <Group wrap="nowrap" gap={GAP} align="center" style={{ flexShrink: 0, minWidth: 0 }}>
          {visible.map((f) => (
            <FilterChip key={f.key} filter={f} />
          ))}
          {showFunnel && (
            <Indicator
              label={hiddenCount}
              size={16}
              disabled={hiddenCount === 0}
              offset={3}
              color="blue"
            >
              <Tooltip label={filtersLabel}>
                <ActionIcon
                  variant={panelOpen || hiddenCount > 0 ? 'light' : 'default'}
                  size={CONTROL_H}
                  onClick={() => setPanelOpen((o) => !o)}
                  aria-label={filtersLabel}
                  aria-expanded={panelOpen}
                >
                  <ListFilter size={16} />
                </ActionIcon>
              </Tooltip>
            </Indicator>
          )}
          {searchInline && searchField}
          {selection && !selectionInDrawer && (
            <div style={{ flexShrink: 0, marginLeft: GAP }}>
              {chosen.selMode === 'switch' ? (
                <PikkuSwitch
                  ariaLabel={selection.ariaLabel}
                  value={selection.value}
                  onChange={selection.onChange}
                  options={selection.options}
                  showAllLabels={switchShowAllLabels}
                />
              ) : (
                <CycleSwitch selection={selection} />
              )}
            </div>
          )}
          {actions.length > 0 && <ActionCluster actions={actions} mode={chosen.actMode} />}
          {actionsNode}
        </Group>
      </Group>
      </Paper>

      {/* Overflow row — the funnel slides the collapsed controls down as a
          second toolbar row, pushing the page content below it. */}
      <Collapse in={panelOpen && showFunnel}>
        <Box
          px="xl"
          py="xs"
          style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
        >
          <Group wrap="wrap" gap="sm" align="center">
            {hidden.map((f) => (
              <FilterChip key={f.key} filter={f} />
            ))}
            {search && !searchInline && (
              <TextInput
                placeholder={search.placeholder}
                leftSection={<Search size={14} />}
                value={search.value}
                onChange={(e) => search.onChange(e.currentTarget.value)}
                size="sm"
                style={{ flex: '1 1 200px', minWidth: 0 }}
                styles={{ input: { height: CONTROL_H, minHeight: CONTROL_H } }}
              />
            )}
            {selection && selectionInDrawer && (
              <PikkuSwitch
                ariaLabel={selection.ariaLabel}
                value={selection.value}
                onChange={selection.onChange}
                options={selection.options}
                showAllLabels={switchShowAllLabels}
              />
            )}
          </Group>
        </Box>
      </Collapse>

      {/* Hidden measurement layer — natural widths for the fit calculation. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -99999,
          left: 0,
          display: 'flex',
          gap: GAP,
          whiteSpace: 'nowrap',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {title != null &&
          measureNode(
            'title',
            <Text component="div" fz="sm" fw={600}>
              {title}
            </Text>,
          )}
        {count != null &&
          measureNode(
            'count',
            <Text component="div" fz="xs" c="dimmed">
              {count}
            </Text>,
          )}
        {selection &&
          measureNode(
            'selSwitch',
            <PikkuSwitch
              ariaLabel={selection.ariaLabel}
              value={selection.value}
              onChange={() => {}}
              options={selection.options}
              showAllLabels={switchShowAllLabels}
            />,
          )}
        {selection && measureNode('selCycle', <CycleSwitch selection={selection} />)}
        {filters.map((f) => measureNode('filter:' + f.key, <FilterChip filter={f} withinPortal={false} />))}
        {search && measureNode('search', searchField)}
        {actions.length > 0 && measureNode('actLabel', <ActionCluster actions={actions} mode="label" />)}
        {actions.length > 0 && measureNode('actIcon', <ActionCluster actions={actions} mode="icon" />)}
        {actions.length > 0 && measureNode('actCompact', <ActionCluster actions={actions} mode="compact" />)}
        {actionsNode != null && measureNode('actNode', actionsNode)}
        {(filters.length > 0 || search || selection) &&
          measureNode(
            'funnel',
            <ActionIcon variant="light" size={CONTROL_H}>
              <ListFilter size={16} />
            </ActionIcon>,
          )}
      </div>
    </>
  )
}
