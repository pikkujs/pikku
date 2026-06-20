import type { ReactNode } from 'react'
import { asI18n, type I18nNode, type I18nString } from '@pikku/react'
import type { PikkuSwitchOption } from './PikkuSwitch'

export interface ShellHeaderSelection<T extends string> {
  ariaLabel: I18nString
  value: T
  onChange: (value: T) => void
  options: Array<PikkuSwitchOption<T>>
}

export interface ShellHeaderFilterOption {
  value: string
  label: I18nString
}

export interface ShellHeaderFilter {
  key: string
  /** Field name, e.g. "Status". */
  label: I18nString
  /** With `options`: the selected option's value (a key). Without: a display value. */
  value: string
  options?: ShellHeaderFilterOption[]
  onChange?: (value: string) => void
  icon?: ReactNode
  /** Higher priority stays inline longer when space runs out (default 0). */
  priority?: number
}

export interface ShellHeaderSearch {
  placeholder: I18nString
  value: string
  onChange: (value: string) => void
  /** Inline width in px (default 220). */
  width?: number
}

export interface ShellHeaderAction {
  key: string
  label: I18nString
  icon?: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'default' | 'subtle'
  disabled?: boolean
  tooltip?: I18nString
  /** Always render icon-only (with tooltip), never showing the label. */
  iconOnly?: boolean
}

export interface ShellHeaderProps<T extends string = string> {
  /** Page title shown at the very start; the first thing to drop when narrow. */
  title?: I18nNode
  /** Status/count chip shown far left, already formatted (e.g. "6 · 1 error"). */
  count?: I18nNode
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
  filtersTitle?: I18nString
}

export const GAP = 8
export const SAFETY = 6
// Every control in the bar is forced to this height so the switch, search,
// funnel, filter chips and actions line up. Mantine `size` tokens are not
// equal-height across Button/ActionIcon/TextInput, so height is set explicitly.
export const CONTROL_H = 32

export type SelMode = 'switch' | 'cycle' | 'drawer'
export type ActMode = 'label' | 'icon' | 'compact'
export interface Candidate {
  showTitle: boolean
  showCount: boolean
  selMode: SelMode
  visCount: number
  searchInline: boolean
  actMode: ActMode
}

/* Keep the `visCount` highest-priority filters; return both sets in source order. */
export function partitionFilters(
  filters: ShellHeaderFilter[],
  visCount: number
) {
  const order = filters.map((_, i) => i)
  order.sort(
    (a, b) => (filters[b]!.priority ?? 0) - (filters[a]!.priority ?? 0) || a - b
  )
  const keep = new Set(order.slice(0, visCount))
  return {
    visible: filters.filter((_, i) => keep.has(i)),
    hidden: filters.filter((_, i) => !keep.has(i)),
  }
}

// The display value is an option's already-translated label, or — with no
// options — the raw filter value (an opaque value, hence asI18n, not English).
export function filterDisplay(f: ShellHeaderFilter): I18nString {
  if (!f.options) return asI18n(f.value)
  return f.options.find((o) => o.value === f.value)?.label ?? asI18n(f.value)
}
