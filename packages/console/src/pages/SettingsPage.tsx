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
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { PikkuBadge } from '../components/ui/PikkuBadge'
import { RefreshCw } from 'lucide-react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

export const SettingsPage: React.FC = () => {
  useLocale()
  const { counts, loading, error, refresh } = usePikkuMeta()

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Box>
          <Text size="xl" fw={700}>
            {m.settings_title()}
          </Text>
          <Text size="sm" c="dimmed">
            {m.settings_description()}
          </Text>
        </Box>

        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600}>{m.settings_metadata()}</Text>
              <Button
                variant="light"
                size="sm"
                leftSection={<RefreshCw size={14} />}
                loading={loading}
                onClick={refresh}
              >
                {m.common_refresh()}
              </Button>
            </Group>
            {error && (
              <Text size="sm" c="red">
                {asI18n(error)}
              </Text>
            )}
            <Group gap="lg" style={{ flexWrap: 'wrap' }}>
              <MetaStat
                label={m.settings_stat_functions()}
                count={counts.functions}
              />
              <MetaStat
                label={m.settings_stat_workflows()}
                count={counts.workflows}
              />
              <MetaStat
                label={m.settings_stat_http_routes()}
                count={counts.httpRoutes}
              />
              <MetaStat
                label={m.settings_stat_channels()}
                count={counts.channels}
              />
              <MetaStat
                label={m.settings_stat_mcp_tools()}
                count={counts.mcpTools}
              />
              <MetaStat
                label={m.settings_stat_gateways()}
                count={counts.gateways}
              />
              <MetaStat
                label={m.settings_stat_cli_commands()}
                count={counts.cliCommands}
              />
              <MetaStat
                label={m.settings_stat_schedulers()}
                count={counts.schedulers}
              />
              <MetaStat
                label={m.settings_stat_queues()}
                count={counts.queues}
              />
              <MetaStat
                label={m.settings_stat_rpc_methods()}
                count={counts.rpcMethods}
              />
            </Group>
          </Stack>
        </Paper>

        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Text fw={600}>{m.settings_about()}</Text>
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                {m.settings_product_name()}
              </Text>
              <PikkuBadge type="label">{asI18n('Alpha')}</PikkuBadge>
            </Group>
            <Text size="sm" c="dimmed">
              {m.settings_product_description()}
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
