import { Indicator, Text, UnstyledButton } from '@pikku/mantine/core'
import { spotlight } from '@mantine/spotlight'
import { PanelLeft, LayoutList, Search } from 'lucide-react'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import { closeMobileSheets } from './MobileSheet'
import classes from './MobileTabBar.module.css'

/** A surface only one app has, taking a slot on the bar beside the ones every
 *  app shares. */
export interface MobileTab {
  key: string
  icon: React.ReactNode
  label: I18nString
  active?: boolean
  onSelect: () => void
  /** Marks the tab while its surface is up — for one that keeps running while
   *  it is open rather than being picked from and dismissed. */
  indicator?: boolean
}

// The phone-only bottom bar. On narrow viewports the nav dock is a pointer
// surface occupying the same edge a thumb needs, so the layout drops it and
// mounts this instead: large tap targets for Nav (opens the rail as a bottom
// sheet), Options (the PAGE's own rail, as a bottom sheet — shown only on the
// pages that have one, see PageOptionsPortal) and Search (command palette).
// Account lives inside the Nav rail, not here. Rendered only when the layout
// has already decided we're mobile, so it owns no breakpoint of its own. Five
// is the platform ceiling and the fifth slot is reserved for the label to stay
// legible at 320px — so an app has at most two `extraTabs` to spend.
function TabButton({
  icon,
  label,
  active,
  onClick,
  indicator,
}: {
  icon: React.ReactNode
  label: I18nString
  active?: boolean
  onClick: () => void
  indicator?: boolean
}) {
  const button = (
    <UnstyledButton
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`${classes.tab} ${active ? classes.tabActive : ''}`}
    >
      {icon}
      <Text component="span" className={classes.label}>
        {label}
      </Text>
    </UnstyledButton>
  )
  return indicator ? (
    <Indicator size={7} offset={8} disabled={!active} color="green" withBorder>
      {button}
    </Indicator>
  ) : (
    button
  )
}

export function MobileTabBar({
  navOpen,
  onToggleNav,
  optionsOpen,
  optionsLabel,
  onToggleOptions,
  extraTabs,
}: {
  navOpen: boolean
  onToggleNav: () => void
  /** Absent on pages with no options rail — the tab is then not rendered. */
  optionsOpen?: boolean
  /** What the page called its rail; falls back to the generic "Options". */
  optionsLabel?: I18nString | null
  onToggleOptions?: () => void
  /** An app's own surfaces (fabric's assistant), between the page's options and
   *  search — so the two ends of the bar mean the same thing everywhere. */
  extraTabs?: MobileTab[]
}) {
  return (
    <nav className={classes.bar} aria-label={m.common_nav()}>
      <TabButton
        icon={<PanelLeft size={20} strokeWidth={2} />}
        label={m.common_nav()}
        active={navOpen}
        onClick={onToggleNav}
      />
      {onToggleOptions && (
        <TabButton
          icon={<LayoutList size={20} strokeWidth={2} />}
          label={optionsLabel ?? m.common_options()}
          active={optionsOpen}
          onClick={onToggleOptions}
        />
      )}
      {extraTabs?.map((tab) => (
        <TabButton
          key={tab.key}
          icon={tab.icon}
          label={tab.label}
          active={tab.active}
          indicator={tab.indicator}
          onClick={tab.onSelect}
        />
      ))}
      {/* The palette is a Spotlight, not a sheet, so it can't take part in the
          one-at-a-time rule the sheets keep among themselves — it clears the
          foot itself, and every tab then behaves the same way: put away what's
          up, raise what was asked for. */}
      <TabButton
        icon={<Search size={20} strokeWidth={2} />}
        label={m.common_search()}
        onClick={() => {
          closeMobileSheets()
          spotlight.open()
        }}
      />
    </nav>
  )
}
