import type { FC } from 'react'
import { Box, Stack, Text, Title } from '@pikku/mantine/core'
import { AgentChat } from '@/components/AgentChat'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

/**
 * The shop assistant's page.
 *
 * The chat itself lives in `AgentChat`, because this page used to BE the chat —
 * hardcoded to `/agents/shop`, which is why the other two agents had no screen.
 */
export const AssistantPage: FC = () => {
  useLocale()
  return (
    <Stack gap="lg" maw={720}>
      <Box>
        <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
          {m.assistant__title()}
        </Title>
        <Text c="dimmed" size="sm">{m.assistant__subtitle()}</Text>
      </Box>

      <AgentChat agent="shop" />
    </Stack>
  )
}
