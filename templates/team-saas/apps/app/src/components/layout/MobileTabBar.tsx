import { useEffect, useState, type CSSProperties, type FC, type ReactNode } from 'react'
import type { I18nString } from '@pikku/react'
import { Box, Divider, Stack, Text, UnstyledButton, rem } from '@pikku/mantine/core'
import { Link } from '@tanstack/react-router'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Wordmark } from '../Wordmark'
import { MobileSheet } from './MobileSheet'
import { ShellSettings } from './ShellSettings'
import { TAB_BAR_HEIGHT, usePhone } from './mobileLayout'
import { MoreGlyph, NavList, useActiveNavPath, type NavItem } from './nav'

/** Five is the platform limit and the fifth slot keeps labels legible at 320px. */
const MAX_TABS = 4

export interface MobileTab {
  key: string
  icon: ReactNode
  label: I18nString
  active?: boolean
  onClick: () => void
  /** How the bar puts this surface away when another tab is tapped. */
  close?: () => void
}

function tabStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rem(3),
    color: active ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-color-dimmed)',
    transition: 'color 120ms ease',
    WebkitTapHighlightColor: 'transparent',
  }
}

const TabLabel: FC<{ children: I18nString }> = ({ children }) => (
  <Text
    component="span"
    fz={10}
    fw={500}
    lh={1}
    maw="100%"
    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
  >
    {children}
  </Text>
)

/**
 * The phone's foot bar. Mount it once in the AppShell; it hides itself above 48em.
 *
 * Destinations get what's left of `MAX_TABS` after More and any `extraTabs`, and the
 * rest overflow into the More sheet — so adding screens can never break the layout.
 * The bar owns mutual exclusion between surfaces, since only it can see all of them.
 *
 * @param extraTabs - Slots for surfaces a scaffold adds later (page options, search).
 */
export const MobileTabBar: FC<{
  items: NavItem[]
  extraTabs?: MobileTab[]
}> = ({ items, extraTabs }) => {
  useLocale()
  const activePath = useActiveNavPath(items)
  const phone = usePhone()
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!phone) setMoreOpen(false)
  }, [phone])

  const slots = Math.max(1, MAX_TABS - 1 - (extraTabs?.length ?? 0))
  const destinations = items.slice(0, slots)
  const overflow = items.slice(slots)

  const closeExtras = (except?: string) => {
    for (const tab of extraTabs ?? []) if (tab.key !== except) tab.close?.()
  }

  return (
    <>
      {/* `hiddenFrom`, not `usePhone`, so the server-rendered HTML is already correct. */}
      <Box
        component="nav"
        hiddenFrom="sm"
        aria-label={m.app_shell__menu()}
        style={{
          position: 'fixed',
          insetInline: 0,
          bottom: 0,
          // Over the page, under Mantine's modal layer (200), so a sheet renders
          // above the bar's siblings while the bar stays tappable beside it.
          zIndex: 190,
          display: 'flex',
          alignItems: 'stretch',
          height: `calc(${rem(TAB_BAR_HEIGHT)} + env(safe-area-inset-bottom, 0px))`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'var(--mantine-color-body)',
          borderTop: '1px solid var(--mantine-color-default-border)',
        }}
      >
        {destinations.map(({ to, label, Icon }) => (
          <UnstyledButton
            key={to}
            component={Link}
            to={to}
            aria-current={to === activePath ? 'page' : undefined}
            onClick={() => {
              setMoreOpen(false)
              closeExtras()
            }}
            style={tabStyle(to === activePath)}
          >
            <Icon size={20} />
            <TabLabel>{label}</TabLabel>
          </UnstyledButton>
        ))}

        {extraTabs?.map(({ key, icon, label, active, onClick }) => (
          <UnstyledButton
            key={key}
            // aria-pressed, not aria-current: these toggle a surface, not a location.
            aria-pressed={active}
            onClick={() => {
              setMoreOpen(false)
              closeExtras(key)
              onClick()
            }}
            style={tabStyle(active ?? false)}
          >
            {icon}
            <TabLabel>{label}</TabLabel>
          </UnstyledButton>
        ))}

        <UnstyledButton
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => {
            closeExtras()
            setMoreOpen((open) => !open)
          }}
          style={tabStyle(moreOpen)}
        >
          <MoreGlyph size={20} />
          <TabLabel>{m.nav__more()}</TabLabel>
        </UnstyledButton>
      </Box>

      <MobileSheet opened={moreOpen} onClose={() => setMoreOpen(false)}>
        <Stack gap="sm" p="md">
          <Wordmark name={m.app__name()} size={20} />
          {overflow.length > 0 ? (
            <>
              <NavList items={overflow} onNavigate={() => setMoreOpen(false)} />
              <Divider />
            </>
          ) : null}
          <ShellSettings />
        </Stack>
      </MobileSheet>
    </>
  )
}
