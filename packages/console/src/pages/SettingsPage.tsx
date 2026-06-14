import React from 'react'
import {
  Box,
  Container,
  Text,
  Stack,
  Paper,
  Group,
  Button,
} from '@pikku/mantine/core'
import { type I18nNode, asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
import { PikkuBadge } from '../components/ui/PikkuBadge'
import { RefreshCw } from 'lucide-react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

export const SettingsPage: React.FC = () => {
  const { t } = useI18n()
  const { counts, loading, error, refresh } = usePikkuMeta()

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Box>
          <Text size="xl" fw={700}>
            {t('settings.title')}
          </Text>
          <Text size="sm" c="dimmed">
            {t('settings.description')}
          </Text>
        </Box>

        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600}>{t('settings.metadata')}</Text>
              <Button
                variant="light"
                size="sm"
                leftSection={<RefreshCw size={14} />}
                loading={loading}
                onClick={refresh}
              >
                {t('common.refresh')}
              </Button>
            </Group>
            {error && (
              <Text size="sm" c="red">
                {asI18n(error)}
              </Text>
            )}
            <Group gap="lg" style={{ flexWrap: 'wrap' }}>
              <MetaStat label={t('settings.stat.functions')} count={counts.functions} />
              <MetaStat label={t('settings.stat.workflows')} count={counts.workflows} />
              <MetaStat label={t('settings.stat.http_routes')} count={counts.httpRoutes} />
              <MetaStat label={t('settings.stat.channels')} count={counts.channels} />
              <MetaStat label={t('settings.stat.mcp_tools')} count={counts.mcpTools} />
              <MetaStat label={t('settings.stat.cli_commands')} count={counts.cliCommands} />
              <MetaStat label={t('settings.stat.schedulers')} count={counts.schedulers} />
              <MetaStat label={t('settings.stat.queues')} count={counts.queues} />
              <MetaStat label={t('settings.stat.rpc_methods')} count={counts.rpcMethods} />
            </Group>
          </Stack>
        </Paper>

        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Text fw={600}>{t('settings.about')}</Text>
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                {t('settings.product_name')}
              </Text>
              <PikkuBadge type="label">{asI18n('Alpha')}</PikkuBadge>
            </Group>
            <Text size="sm" c="dimmed">
              {t('settings.product_description')}
            </Text>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}

const MetaStat: React.FC<{
  label: I18nNode
  count: number
}> = ({ label, count }) => (
  <Box>
    <Text size="lg" fw={700}>
      {count}
    </Text>
    <Text size="sm" c="dimmed">
      {label}
    </Text>
  </Box>
)
