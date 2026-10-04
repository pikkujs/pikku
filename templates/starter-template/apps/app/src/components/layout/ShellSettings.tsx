import type { FC } from 'react'
import {
  Avatar,
  Menu,
  NavLink,
  Skeleton,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@pikku/mantine/core'
import { Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { usePikkuQuery } from '@project/functions-sdk/pikku/api.gen'
import { themeList } from '@project/mantine-themes'
import { asI18n, m } from '@/i18n/messages'
import { supportedLocales, useLocale } from '@/i18n/config'
import { usePreferences } from '@/contexts/preferences'
import { signOut } from '@/lib/auth'
import { displayName, initials } from '@/lib/initials'
import { LOCALE_LABELS } from '../LanguageSelector'
import { MoonGlyph, SunGlyph } from '../ColorSchemeToggle'
import { AccountGlyph, CheckGlyph, SelectorGlyph, SignOutGlyph } from './nav'
import { usePhone } from './mobileLayout'

/**
 * The account menu — an identity row at the foot of a sidebar, an avatar at the end
 * of a top bar, and the same row inside the phone's More sheet or nav drawer. Theme,
 * colour scheme, language and sign-out all hang off it.
 *
 * @param orientation - `horizontal` for a header bar with one row to spend.
 */
export const ShellSettings: FC<{ orientation?: 'vertical' | 'horizontal' }> = ({
  orientation = 'vertical',
}) => {
  useLocale()
  const phone = usePhone()
  const session = usePikkuQuery('getSession', {})
  const { setColorScheme } = useMantineColorScheme()
  const scheme = useComputedColorScheme('light')
  const { locale, setLocale, themeId, setThemeId } = usePreferences()

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      window.location.href = '/app/auth/login'
    },
  })

  const email = session.data?.email ?? ''
  const name = email ? displayName(session.data?.name, email) : ''
  const horizontal = orientation === 'horizontal'

  const avatar = (
    <Avatar size={horizontal ? 30 : 32} radius="xl" color="initials" name={email}>
      {asI18n(initials(session.data?.name, email))}
    </Avatar>
  )

  if (session.isPending) {
    return horizontal ? <Skeleton circle height={30} /> : <Skeleton height={52} radius="md" />
  }

  const target = horizontal ? (
    <UnstyledButton aria-label={m.app_shell__account()} style={{ lineHeight: 0 }}>
      {avatar}
    </UnstyledButton>
  ) : (
    <NavLink
      component="button"
      aria-label={m.app_shell__account()}
      label={name ? asI18n(name) : m.app_shell__account()}
      description={email ? asI18n(email) : undefined}
      leftSection={avatar}
      rightSection={<SelectorGlyph size={14} />}
      styles={{
        root: { borderRadius: 'var(--mantine-radius-md)' },
        body: { minWidth: 0 },
        label: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        description: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      }}
    />
  )

  return (
    <Menu
      shadow="md"
      radius="md"
      width={horizontal || phone ? 240 : 'target'}
      position={horizontal ? 'bottom-end' : phone ? 'top-start' : 'right-end'}
      offset={8}
      withinPortal
    >
      <Menu.Target>{target}</Menu.Target>

      <Menu.Dropdown>
        {horizontal && email ? (
          <>
            <Menu.Label
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {asI18n(email)}
            </Menu.Label>
            <Menu.Divider />
          </>
        ) : null}

        <Menu.Item component={Link} to="/app/account" leftSection={<AccountGlyph />}>
          {m.nav__account()}
        </Menu.Item>

        <Menu.Item
          closeMenuOnClick={false}
          leftSection={scheme === 'dark' ? <SunGlyph /> : <MoonGlyph />}
          onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
        >
          {scheme === 'dark' ? m.preferences__light_mode() : m.preferences__dark_mode()}
        </Menu.Item>

        {themeList.length > 1 ? (
          <>
            <Menu.Divider />
            <Menu.Label>{m.preferences__theme()}</Menu.Label>
            {themeList.map((theme) => (
              <Menu.Item
                key={theme.id}
                closeMenuOnClick={false}
                rightSection={theme.id === themeId ? <CheckGlyph size={14} /> : undefined}
                onClick={() => setThemeId(theme.id)}
              >
                {asI18n(theme.name)}
              </Menu.Item>
            ))}
          </>
        ) : null}

        {supportedLocales.length > 1 ? (
          <>
            <Menu.Divider />
            <Menu.Label>{m.preferences__language()}</Menu.Label>
            {supportedLocales.map((code) => (
              <Menu.Item
                key={code}
                closeMenuOnClick={false}
                rightSection={code === locale ? <CheckGlyph size={14} /> : undefined}
                onClick={() => setLocale(code)}
              >
                {asI18n(LOCALE_LABELS[code] ?? code.toUpperCase())}
              </Menu.Item>
            ))}
          </>
        ) : null}

        <Menu.Divider />

        <Menu.Item
          leftSection={<SignOutGlyph />}
          disabled={signOutMutation.isPending}
          onClick={() => signOutMutation.mutate()}
        >
          {m.app_shell__sign_out()}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
