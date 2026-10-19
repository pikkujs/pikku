import type { FC } from 'react'
import { AppShell as MantineAppShell, Box, Stack } from '@pikku/mantine/core'
import { Outlet } from '@tanstack/react-router'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Wordmark } from './Wordmark'
import { MobileTabBar } from './layout/MobileTabBar'
import { NavList, useNavItems } from './layout/nav'
import { ShellSettings } from './layout/ShellSettings'
import { TAB_BAR_FOOT } from './layout/mobileLayout'

/**
 * STARTER-SHELL-DEFAULT — the marker for "this app never picked a silhouette", read
 * by the orchestrator's init-app-chrome (which pre-writes a real shell over it) and
 * by the build-complete gate (which refuses a build still wearing it). Every
 * `fabric scaffold --name shell` recipe replaces this file, so the marker's absence
 * means a silhouette was chosen. Don't delete it to silence the gate — pick a shell.
 */
export const AppShell: FC = () => {
  useLocale()
  const navItems = useNavItems()

  return (
    <MantineAppShell
      navbar={{ width: 236, breakpoint: 'sm', collapsed: { mobile: true } }}
      // `xl` on a 390px phone spends 64 of 390 points on gutters.
      padding={{ base: 'md', sm: 'xl' }}
    >
      <MantineAppShell.Navbar p="md">
        <Stack h="100%" gap={4}>
          <Box px="xs" py="sm">
            <Wordmark name={m.app__name()} size={26} />
          </Box>

          <Box mt="xs">
            <NavList items={navItems} />
          </Box>

          <Box mt="auto">
            <ShellSettings />
          </Box>
        </Stack>
      </MantineAppShell.Navbar>

      {/* Flex column so a full-height page can fill the region with `flex: 1`. */}
      <MantineAppShell.Main style={{ display: 'flex', flexDirection: 'column' }}>
        <Outlet />

        {/* Clears the foot bar. A spacer rather than padding on Main, so it can be
            hidden above `sm` instead of leaving dead space on desktop. */}
        <Box hiddenFrom="sm" style={{ flex: 'none', height: TAB_BAR_FOOT }} />

        <MobileTabBar items={navItems} />
      </MantineAppShell.Main>
    </MantineAppShell>
  )
}
