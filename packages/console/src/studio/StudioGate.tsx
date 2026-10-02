import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Center, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'
import { isStudio, leaveProject, openProjectKey, studioCall, useStudioAccount } from './studio'
import { StudioWelcome } from './StudioWelcome'
import { StudioChooseAi } from './StudioChooseAi'
import { StudioProjectsPage } from './StudioProjectsPage'

const OpenProject: React.FC<{ projectKey: string; children: React.ReactNode }> = ({ projectKey, children }) => {
  const open = useQuery({
    queryKey: ['studio', 'open', projectKey],
    queryFn: () => studioCall('openProject', { key: projectKey }),
    staleTime: Infinity,
    retry: false,
  })
  if (open.isLoading) return <ConsoleLoading h="100vh" />
  if (open.error) {
    return (
      <Center mih="100vh">
        <Stack align="center" gap="sm">
          <Text>{m.studio_open_failed()}</Text>
          <Text size="sm" c="dimmed">
            {asI18n(open.error.message)}
          </Text>
          <Button variant="default" onClick={leaveProject}>
            {m.studio_back_to_projects()}
          </Button>
        </Stack>
      </Center>
    )
  }
  return <>{children}</>
}

const Studio: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const account = useStudioAccount()
  if (account.isLoading) return <ConsoleLoading h="100vh" />
  if (!account.data?.signIn) return <StudioWelcome />
  if (!account.data.ai) return <StudioChooseAi />
  const key = openProjectKey()
  if (!key) return <StudioProjectsPage />
  return <OpenProject projectKey={key}>{children}</OpenProject>
}

export const StudioGate: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  isStudio() ? <Studio>{children}</Studio> : <>{children}</>
