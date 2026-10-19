import type { FC, ReactNode } from 'react'
import type { I18nNode, I18nString } from '@pikku/react'
import { Box, Card, Group, Stack, Text, Title } from '@pikku/mantine/core'
import { useLocale } from '@/i18n/config'
import { Wordmark } from './Wordmark'

// The CHROME shared by every auth screen — sign in, sign up, forgot password,
// reset password. Only the form in the middle differs, so the design lives here
// once: restyle this file and all four screens move together. Never re-create
// this frame inside a page; pass the form as children.
type AuthShellProps = {
  appName: I18nString
  title: I18nString
  description: I18nString
  footer: I18nNode
  children: ReactNode
}

export const AuthShell: FC<AuthShellProps> = (props) => {
  useLocale()

  return (
    <Box
      mih="100vh"
      style={{
        display: 'grid',
        placeItems: 'center',
        background: 'var(--mantine-color-body)',
      }}
      p="xl"
    >
      <Stack w="100%" maw={380} gap="lg">
        <Group justify="center">
          <Wordmark name={props.appName} />
        </Group>

        <Card withBorder radius="lg" shadow="sm" padding="xl">
          <Stack gap="lg">
            <div>
              <Title order={2} fz={21} fw={650} style={{ letterSpacing: '-0.025em' }}>
                {props.title}
              </Title>
              <Text c="dimmed" size="sm" mt={4}>
                {props.description}
              </Text>
            </div>

            {props.children}
          </Stack>
        </Card>

        <Text ta="center" size="sm" c="dimmed">
          {props.footer}
        </Text>
      </Stack>
    </Box>
  )
}
