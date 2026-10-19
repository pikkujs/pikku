import type { FC } from 'react'
import { Button, Group, Stack } from '@pikku/mantine/core'
import { useMutation } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { signOut } from '@/lib/auth'
import { LanguageSelector } from '../LanguageSelector'
import { ThemeSelector } from '../ThemeSelector'
import { ColorSchemeToggle } from '../ColorSchemeToggle'
import { SignOutGlyph } from './nav'

/**
 * Preferences + sign out — the foot of a sidebar, the end of a top bar, and the body
 * of the phone's More sheet or nav drawer.
 *
 * @param orientation - `horizontal` for a header bar with one row to spend.
 */
export const ShellSettings: FC<{ orientation?: 'vertical' | 'horizontal' }> = ({
  orientation = 'vertical',
}) => {
  useLocale()
  const signOutMutation = useMutation({
    mutationFn: signOut,
    // A full load, not a router navigation — drops every cached query and the
    // client's in-memory session along with the cookie.
    onSuccess: () => {
      window.location.href = '/app/login'
    },
  })

  const signOutButton = (
    <Button
      variant="subtle"
      color="gray"
      size={orientation === 'horizontal' ? 'xs' : undefined}
      fullWidth={orientation === 'vertical'}
      justify={orientation === 'vertical' ? 'flex-start' : undefined}
      leftSection={<SignOutGlyph />}
      loading={signOutMutation.isPending}
      onClick={() => signOutMutation.mutate()}
    >
      {m.app_shell__sign_out()}
    </Button>
  )

  if (orientation === 'horizontal') {
    return (
      <Group gap="xs" wrap="nowrap">
        <ThemeSelector />
        <LanguageSelector />
        <ColorSchemeToggle />
        {signOutButton}
      </Group>
    )
  }

  return (
    <Stack gap="xs">
      <ThemeSelector />
      <Group gap="xs" wrap="nowrap">
        <LanguageSelector />
        <ColorSchemeToggle />
      </Group>
      {signOutButton}
    </Stack>
  )
}
