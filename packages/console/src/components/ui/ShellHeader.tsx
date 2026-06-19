import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Indicator,
  Menu,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { ChevronDown, ListFilter, MoreHorizontal, Search } from 'lucide-react'
import { PikkuSwitch, type PikkuSwitchOption } from './PikkuSwitch'

/* ============================================================================
   ShellHeader — one compact bar that replaces the tall title + action-bar
   block: selection on the left, filters in the middle, actions on the right.
   Filters that don't fit collapse into a funnel → drawer (the text search is
   the last to collapse); action labels fold to icons; the selection switch
   becomes a single cycling button when narrow. All measured, not breakpointed.
   Props-only: every label/value is passed already-translated by the caller.
   ========================================================================== */

export interface ShellHeaderSelection<T extends string> {
  ariaLabel: string
  value: T
  onChange: (value: T) => void
  options: Array<PikkuSwitchOption<T>>
}

export interface ShellHeaderFilterOption {
  value: string
  label: string
}

export interface ShellHeaderFilter {
  key: string
  /** Field name, e.g. "Status". */
  label: string
  /** With `options`: the selected option's value. Without: a display string. */
  value: string
  options?: ShellHeaderFilterOption[]
  onChange?: (value: string) => void
  icon?: ReactNode
  /** Higher priority stays inline longer when space runs out (default 0). */
  priority?: number
}

export interface ShellHeaderSearch {
  placeholder: string
  value: string
  onChange: (value: string) => void
  /** Inline width in px (default 220). */
  width?: number
}

export interface ShellHeaderAction {
  key: string
  label: string
  icon?: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'default' | 'subtle'
  disabled?: boolean
  tooltip?: string
  /** Always render icon-only (with tooltip), never showing the label. */
  iconOnly?: boolean
}

export interface ShellHeaderProps<T extends string = string> {
  /** Page title shown at the very start; the first thing to drop when narrow. */
  title?: ReactNode
  /** Status/count chip shown far left, already formatted (e.g. "6 · 1 error"). */
  count?: ReactNode
  /** Left selection control: PikkuSwitch when wide, a cycle button when narrow. */
  selection?: ShellHeaderSelection<T>
  /** Middle dropdown filters; overflow folds into a funnel → drawer. */
  filters?: ShellHeaderFilter[]
  /** Text filter; the last thing to fold into the drawer. */
  search?: ShellHeaderSearch
  /** Right-side actions; labels fold to icons, secondaries to a menu when narrow. */
  actions?: ShellHeaderAction[]
  /** Pre-rendered right-side controls (escape hatch for callers that already
   *  have JSX buttons). Rendered after structured `actions`; not collapsed. */
  actionsNode?: ReactNode
  /** Heading for the collapsed-filters drawer (default "Filters"). */
  filtersTitle?: string
}

const GAP = 8
const SAFETY = 6

type SelMode = 'switch' | 'cycle'
type ActMode = 'label' | 'icon' | 'compact'
interface Candidate {
  showTitle: boolean
  selMode: SelMode
  visCount: number
  searchInline: boolean
  actMode: ActMode
}

/* Keep the `visCount` highest-priority filters; return both sets in source order. */
function partitionFilters(filters: ShellHeaderFilter[], visCount: number) {
  const order = filters.map((_, i) => i)
  order.sort((a, b) => (filters[b]!.priority ?? 0) - (filters[a]!.priority ?? 0) || a - b)
  const keep = new Set(order.slice(0, visCount))
  return {
    visible: filters.filter((_, i) => keep.has(i)),
    hidden: filters.filter((_, i) => !keep.has(i)),
  }
}

function filterDisplay(f: ShellHeaderFilter): string {
  if (!f.options) return f.value
  return f.options.find((o) => o.value === f.value)?.label ?? f.value
}

function FilterChip({ filter, withinPortal = true }: { filter: ShellHeaderFilter; withinPortal?: boolean }) {
  const target = (
    <Button
      variant="default"
      size="sm"
      leftSection={filter.icon}
      rightSection={filter.options ? <ChevronDown size={13} /> : undefined}
      onClick={filter.options ? undefined : filter.onChange ? () => filter.onChange?.(filter.value) : undefined}
      styles={{ root: { flexShrink: 0 }, label: { gap: 5 } }}
    >
      <Text span fz={11.5} c="dimmed">
        {filter.label}
      </Text>
      <Text span fz={12.5} fw={600}>
        {filterDisplay(filter)}
      </Text>
    </Button>
  )
  if (!filter.options) return target
  return (
    <Menu position="bottom-start" withinPortal={withinPortal} shadow="md">
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown>
        {filter.options.map((o) => (
          <Menu.Item
            key={o.value}
            fw={o.value === filter.value ? 600 : 400}
            onClick={() => filter.onChange?.(o.value)}
          >
            {o.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

function CycleSwitch<T extends string>({ selection }: { selection: ShellHeaderSelection<T> }) {
  const { options, value, onChange, ariaLabel } = selection
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const cur = options[idx]
  if (!cur) return null
  return (
    <Button
      variant="default"
      size="sm"
      leftSection={cur.icon}
      onClick={() => onChange(options[(idx + 1) % options.length]!.value)}
      aria-label={`${ariaLabel}: ${cur.label}. Click to switch.`}
      styles={{ root: { flexShrink: 0 } }}
    >
      {cur.label}
    </Button>
  )
}

function actionButton(a: ShellHeaderAction, mode: ActMode): ReactNode {
  const variant = a.variant === 'primary' ? 'filled' : a.variant === 'subtle' ? 'subtle' : 'default'
  const effectiveMode: ActMode = a.iconOnly && a.icon ? 'icon' : mode
  if (effectiveMode === 'label' || !a.icon) {
    const btn = (
      <Button
        key={a.key}
        variant={variant}
        size="sm"
        leftSection={a.icon}
        onClick={a.onClick}
        disabled={a.disabled}
        styles={{ root: { flexShrink: 0 } }}
      >
        {a.label}
      </Button>
    )
    return a.tooltip ? (
      <Tooltip key={a.key} label={a.tooltip}>
        {btn}
      </Tooltip>
    ) : (
      btn
    )
  }
  return (
    <Tooltip key={a.key} label={a.tooltip ?? a.label}>
      <ActionIcon variant={variant} size="lg" onClick={a.onClick} disabled={a.disabled} aria-label={a.label}>
        {a.icon}
      </ActionIcon>
    </Tooltip>
  )
}

function ActionCluster({ actions, mode }: { actions: ShellHeaderAction[]; mode: ActMode }) {
  if (mode !== 'compact') {
    return (
      <>
        {actions.map((a) => actionButton(a, mode))}
      </>
    )
  }
  // compact: primaries (and icon-only actions) stay as icons, the rest collapse
  // into a kebab menu.
  const primary = actions.filter((a) => a.variant === 'primary' || a.iconOnly)
  const rest = actions.filter((a) => a.variant !== 'primary' && !a.iconOnly)
  return (
    <>
      {primary.map((a) => actionButton(a, 'icon'))}
      {rest.length > 0 && (
        <Menu position="bottom-end" withinPortal shadow="md">
          <Menu.Target>
            <ActionIcon variant="default" size="lg" aria-label="More actions">
              <MoreHorizontal size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {rest.map((a) => (
              <Menu.Item key={a.key} leftSection={a.icon} onClick={a.onClick} disabled={a.disabled}>
                {a.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
    </>
  )
}

export function ShellHeader<T extends string = string>({
  title,
  count,
  selection,
  filters = [],
  search,
  actions = [],
  actionsNode,
  filtersTitle = 'Filters',
}: ShellHeaderProps<T>) {
  const { ref: sizeRef, width } = useElementSize()
  const measRef = useRef<Record<string, HTMLElement | null>>({})
  const [w, setW] = useState<Record<string, number> | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
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
  const candidates: Candidate[] = [
    { showTitle: false, selMode: 'switch', visCount: F, searchInline: true, actMode: 'label' },
    { showTitle: false, selMode: 'switch', visCount: F, searchInline: true, actMode: 'icon' },
  ]
  for (let n = F - 1; n >= 0; n--) {
    candidates.push({ showTitle: false, selMode: 'switch', visCount: n, searchInline: true, actMode: 'icon' })
  }
  if (search) {
    candidates.push({ showTitle: false, selMode: 'switch', visCount: 0, searchInline: false, actMode: 'icon' })
    candidates.push({ showTitle: false, selMode: 'cycle', visCount: 0, searchInline: false, actMode: 'icon' })
  } else {
    candidates.push({ showTitle: false, selMode: 'cycle', visCount: 0, searchInline: true, actMode: 'icon' })
  }
  candidates.push({
    showTitle: false,
    selMode: 'cycle',
    visCount: 0,
    searchInline: search ? false : true,
    actMode: 'compact',
  })
  // Title is the very first thing to drop: the richest candidate keeps it,
  // every poorer candidate hides it.
  if (title != null) candidates.unshift({ ...candidates[0]!, showTitle: true })

  const measure = (id: string) => (w?.[id] ?? 0)
  const candWidth = (c: Candidate): number => {
    const { visible, hidden } = partitionFilters(filters, c.visCount)
    const showFunnel = hidden.length > 0 || (!!search && !c.searchInline)
    const parts: number[] = []
    if (c.showTitle && title != null) parts.push(measure('title'))
    if (count != null) parts.push(measure('count'))
    if (selection) parts.push(measure(c.selMode === 'switch' ? 'selSwitch' : 'selCycle'))
    visible.forEach((f) => parts.push(measure('filter:' + f.key)))
    if (showFunnel) parts.push(measure('funnel'))
    if (search && c.searchInline) parts.push(measure('search'))
    if (actions.length) {
      parts.push(measure(c.actMode === 'label' ? 'actLabel' : c.actMode === 'icon' ? 'actIcon' : 'actCompact'))
    }
    if (actionsNode != null) parts.push(measure('actNode'))
    const used = parts.filter((p) => p > 0)
    // selection carries an extra marginLeft (GAP) for right-side separation.
    const extra = selection ? GAP : 0
    return used.reduce((s, p) => s + p, 0) + GAP * Math.max(0, used.length - 1) + extra + SAFETY
  }

  let chosen = candidates[0]!
  if (w && width > 0) {
    chosen = candidates.find((c) => candWidth(c) <= width) ?? candidates[candidates.length - 1]!
  }

  const { visible, hidden } = partitionFilters(filters, chosen.visCount)
  const searchInline = chosen.searchInline && !!search
  const hiddenCount = hidden.length + (search && !searchInline ? 1 : 0)
  const showFunnel = hiddenCount > 0

  const searchField = search ? (
    <TextInput
      placeholder={search.placeholder}
      leftSection={<Search size={14} />}
      value={search.value}
      onChange={(e) => search.onChange(e.currentTarget.value)}
      w={searchWidth}
      styles={{ root: { flexShrink: 0 } }}
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
        h={50}
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
        <Group wrap="nowrap" gap={GAP} align="center" style={{ flexShrink: 0 }}>
          {chosen.showTitle && title != null && (
            <Text component="div" fz="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>
              {title}
            </Text>
          )}
          {count != null && (
            <Text component="div" fz="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {count}
            </Text>
          )}
        </Group>

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
              <Tooltip label={filtersTitle}>
                <ActionIcon
                  variant={hiddenCount > 0 ? 'light' : 'default'}
                  size="lg"
                  onClick={() => setDrawerOpen(true)}
                  aria-label={filtersTitle}
                >
                  <ListFilter size={16} />
                </ActionIcon>
              </Tooltip>
            </Indicator>
          )}
          {searchInline && searchField}
          {selection && (
            <div style={{ flexShrink: 0, marginLeft: GAP }}>
              {chosen.selMode === 'switch' ? (
                <PikkuSwitch
                  ariaLabel={selection.ariaLabel}
                  value={selection.value}
                  onChange={selection.onChange}
                  options={selection.options}
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
            />,
          )}
        {selection && measureNode('selCycle', <CycleSwitch selection={selection} />)}
        {filters.map((f) => measureNode('filter:' + f.key, <FilterChip filter={f} withinPortal={false} />))}
        {search && measureNode('search', searchField)}
        {actions.length > 0 && measureNode('actLabel', <ActionCluster actions={actions} mode="label" />)}
        {actions.length > 0 && measureNode('actIcon', <ActionCluster actions={actions} mode="icon" />)}
        {actions.length > 0 && measureNode('actCompact', <ActionCluster actions={actions} mode="compact" />)}
        {actionsNode != null && measureNode('actNode', actionsNode)}
        {(filters.length > 0 || search) &&
          measureNode(
            'funnel',
            <ActionIcon variant="light" size="lg">
              <ListFilter size={16} />
            </ActionIcon>,
          )}
      </div>

      <Drawer
        opened={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        position="right"
        size="sm"
        title={filtersTitle}
      >
        <Stack gap="md">
          {search && !searchInline && (
            <TextInput
              placeholder={search.placeholder}
              leftSection={<Search size={14} />}
              value={search.value}
              onChange={(e) => search.onChange(e.currentTarget.value)}
              data-autofocus
            />
          )}
          {hidden.map((f) => (
            <Stack gap={4} key={f.key}>
              <Text fz="sm" fw={600}>
                {f.label}
              </Text>
              {f.options ? (
                <Select
                  data={f.options}
                  value={f.value}
                  onChange={(v) => v && f.onChange?.(v)}
                  comboboxProps={{ withinPortal: false }}
                  allowDeselect={false}
                />
              ) : (
                <Text fz="sm" c="dimmed">
                  {f.value}
                </Text>
              )}
            </Stack>
          ))}
        </Stack>
      </Drawer>
    </>
  )
}
