import {
  Box,
  Divider,
  NavLink,
  Stack,
  useMantineColorScheme,
  useMantineTheme,
} from '@pikku/mantine/core'
import { Moon, RefreshCw, Sun, UserCog } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useLink, useLocation } from '../../router'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { useOptionalAuth } from '../../context/AuthContext'
import { useOptionalImpersonation } from '../../context/ImpersonationContext'
import { ImpersonateDrawer } from '../auth/ImpersonateDrawer'
import { NavAction } from './NavAction'
import { NavHeading } from './NavHeading'
import {
  useDefaultNavSections,
  type NavItem,
  type NavSection,
} from '../../nav/sections'

export interface NavListProps {
  sections?: NavSection[]
}

/**
 * The whole nav as a flat, scrollable list.
 *
 * The console's nav is the dock, which is a pointer surface — hover raises it
 * and a long press opens its flyouts — so a phone gets this instead: every
 * screen at once under the same section and group headings the dock's flyouts
 * carry, so the two teach the same shape of the console rather than two
 * different ones.
 *
 * It also carries the session actions the dock keeps in its account menu, for
 * the same reason: there is no dock here to keep them in.
 */
export const NavList: React.FC<NavListProps> = ({ sections: sectionsProp }) => {
  const Link = useLink()
  useLocale()
  const theme = useMantineTheme()
  const { pathname } = useLocation()
  const { refresh, loading: metaLoading } = usePikkuMeta()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const auth = useOptionalAuth()
  const impersonation = useOptionalImpersonation()
  const canImpersonate =
    (auth?.can('admin:impersonate') ?? false) && impersonation !== null

  const defaultSections = useDefaultNavSections()
  const sections = sectionsProp ?? defaultSections

  const renderItem = (item: NavItem) => {
    const active = pathname.includes(item.matchPrefix)
    return (
      <Box key={item.href} px={6} py={1}>
        <NavLink
          component={Link}
          to={item.href}
          data-testid="nav-link"
          data-href={item.href}
          label={item.label}
          leftSection={
            <item.icon
              size={16}
              color={active ? 'var(--app-accent)' : undefined}
            />
          }
          active={active}
          variant="light"
          style={{
            borderRadius: theme.radius.sm,
            fontSize: 13,
            // 2px accent bar is the primary "you are here" cue; the soft tint +
            // accent label reinforce it.
            borderLeft: `2px solid ${active ? 'var(--app-accent-strong)' : 'transparent'}`,
            background: active ? 'var(--app-surface-accent)' : undefined,
          }}
          styles={{
            label: {
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--app-accent)' : undefined,
            },
          }}
        />
      </Box>
    )
  }

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <Box style={{ flex: 1 }} py={4}>
        {sections.map((section, sectionIndex) => (
          <Box
            key={section.id}
            data-testid="nav-section"
            data-section={section.id}
          >
            {sectionIndex > 0 && <Divider my={4} mx="sm" />}
            {section.title && <NavHeading>{section.title}</NavHeading>}
            {section.groups.map((group) => (
              <Box key={group.id}>
                {group.title && <NavHeading dim>{group.title}</NavHeading>}
                {group.items.map(renderItem)}
              </Box>
            ))}
          </Box>
        ))}
      </Box>

      <Divider mx="sm" />
      <Stack gap={2} px={6} py={4}>
        {canImpersonate && (
          <NavAction
            icon={<UserCog size={18} />}
            label={m.impersonate_button()}
            onSelect={() => impersonation?.openPicker()}
            testId="impersonate-open"
          />
        )}
        <NavAction
          icon={
            <RefreshCw
              size={18}
              style={
                metaLoading
                  ? { animation: 'spin 1s linear infinite' }
                  : undefined
              }
            />
          }
          label={m.sidebar_refresh()}
          disabled={metaLoading}
          onSelect={() => refresh()}
        />
        <NavAction
          icon={colorScheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          label={
            colorScheme === 'dark'
              ? m.sidebar_light_mode()
              : m.sidebar_dark_mode()
          }
          onSelect={() => toggleColorScheme()}
        />
      </Stack>

      {canImpersonate && (
        <ImpersonateDrawer
          opened={impersonation?.pickerOpen ?? false}
          onClose={() => impersonation?.closePicker()}
        />
      )}
    </Box>
  )
}
