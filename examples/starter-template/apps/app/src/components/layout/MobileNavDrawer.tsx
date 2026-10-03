import { useEffect, type FC } from 'react'
import { Burger, Divider, Drawer, Stack } from '@pikku/mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Wordmark } from '../Wordmark'
import { ShellSettings } from './ShellSettings'
import { usePhone } from './mobileLayout'
import { NavList, type NavItem } from './nav'

/**
 * The alternative to `MobileTabBar` — a burger opening the nav as a side drawer. An
 * app mounts exactly one of the two; see AGENTS.md for which to pick.
 *
 * Renders both the burger and the drawer, so it drops into a phone-only header:
 * `header={{ height: { base: MOBILE_HEADER_HEIGHT, sm: 0 } }}` plus an
 * `<AppShell.Header hiddenFrom="sm">`. A responsive height rather than
 * `header.collapsed`, which is a plain boolean with no breakpoint form — this keeps
 * both the offset and the element on CSS instead of a client-only decision. A shell
 * using this needs no foot spacer.
 */
export const MobileNavDrawer: FC<{ items: NavItem[] }> = ({ items }) => {
  useLocale()
  const [opened, { toggle, close }] = useDisclosure(false)
  const phone = usePhone()

  useEffect(() => {
    if (!phone) close()
  }, [phone, close])

  return (
    <>
      <Burger
        opened={opened}
        onClick={toggle}
        size="sm"
        hiddenFrom="sm"
        aria-label={m.app_shell__menu()}
      />

      <Drawer
        opened={opened}
        onClose={close}
        position="left"
        size={280}
        padding="md"
        title={<Wordmark name={m.app__name()} size={20} />}
        overlayProps={{ backgroundOpacity: 0.55 }}
        transitionProps={{
          transition: {
            in: { transform: 'translateX(0)' },
            out: { transform: 'translateX(-100%)' },
            transitionProperty: 'transform',
          },
          duration: 240,
          timingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <Stack gap="sm">
          <NavList items={items} onNavigate={close} />
          <Divider />
          {/* Not `mt="auto"` — the drawer body is not a flex column, so it no-ops. */}
          <ShellSettings />
        </Stack>
      </Drawer>
    </>
  )
}
