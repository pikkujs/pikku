import React, { useEffect, useState } from 'react'
import { Anchor, Button, Center, Group, Stack, Text, Title } from '@pikku/mantine/core'
import { Cloud, Laptop } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { useQueryClient } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { CardsPage } from '../components/ui/CardsPage'
import { SectionCard } from '../components/ui/SectionCard'
import { studioCall, useStudioAction } from './studio'

type SignIn = { code: string; url: string; expiresAt: string }

const FabricSignIn: React.FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const client = useQueryClient()
  const start = useStudioAction<object, SignIn>('startSignIn')
  const [outcome, setOutcome] = useState<'pending' | 'expired' | 'rejected'>('pending')
  const signIn = start.data

  useEffect(() => {
    start.mutate({})
  }, [])

  useEffect(() => {
    if (!signIn || outcome !== 'pending') return
    const timer = setInterval(async () => {
      const { status } = await studioCall<{ status: string }>('pollSignIn', { code: signIn.code })
      if (status === 'confirmed') {
        clearInterval(timer)
        client.invalidateQueries({ queryKey: ['studio'] })
      } else if (status === 'expired' || status === 'rejected') {
        clearInterval(timer)
        setOutcome(status)
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [signIn, outcome])

  const retry = () => {
    setOutcome('pending')
    start.mutate({})
  }

  return (
    <SectionCard testId="studio-fabric-sign-in" title={m.studio_fabric_title()} blurb={m.studio_fabric_blurb()}>
      <Stack gap="md" mt="md" align="flex-start">
        {start.error && (
          <Text size="sm" c="red">
            {m.studio_fabric_unreachable()}
          </Text>
        )}
        {signIn && outcome === 'pending' && (
          <>
            <Title order={2} ff="monospace" data-testid="studio-fabric-code">
              {asI18n(signIn.code)}
            </Title>
            <Text size="sm">{m.studio_fabric_steps()}</Text>
            <Group>
              <Button component="a" href={signIn.url} target="_blank" rel="noreferrer" data-testid="studio-fabric-open">
                {m.studio_fabric_open()}
              </Button>
              <Text size="sm" c="dimmed">
                {m.studio_fabric_waiting()}
              </Text>
            </Group>
          </>
        )}
        {outcome !== 'pending' && (
          <Group>
            <Text size="sm" c="red">
              {outcome === 'expired' ? m.studio_fabric_expired() : m.studio_fabric_rejected()}
            </Text>
            <Button size="xs" variant="default" onClick={retry}>
              {m.studio_fabric_retry()}
            </Button>
          </Group>
        )}
        <Anchor component="button" size="sm" onClick={onCancel}>
          {m.studio_back()}
        </Anchor>
      </Stack>
    </SectionCard>
  )
}

export const StudioWelcome: React.FC = () => {
  const [fabric, setFabric] = useState(false)
  const local = useStudioAction<object, unknown>('useLocally')
  return (
    <Center mih="100vh" p="md">
      <CardsPage maw={720}>
        <SectionCard hero testId="studio-welcome" title={m.studio_welcome_title()} blurb={m.studio_welcome_blurb()} />
        {fabric ? (
          <FabricSignIn onCancel={() => setFabric(false)} />
        ) : (
          <>
            <SectionCard
              testId="studio-choose-local"
              title={m.studio_local_title()}
              blurb={m.studio_local_blurb()}
              right={
                <Button
                  leftSection={<Laptop size={16} />}
                  loading={local.isPending}
                  onClick={() => local.mutate({})}
                  data-testid="studio-use-locally"
                >
                  {m.studio_local_action()}
                </Button>
              }
            />
            <SectionCard
              testId="studio-choose-fabric"
              title={m.studio_fabric_choice_title()}
              blurb={m.studio_fabric_choice_blurb()}
              right={
                <Button
                  variant="default"
                  leftSection={<Cloud size={16} />}
                  onClick={() => setFabric(true)}
                  data-testid="studio-sign-in-fabric"
                >
                  {m.studio_fabric_choice_action()}
                </Button>
              }
            />
          </>
        )}
      </CardsPage>
    </Center>
  )
}
