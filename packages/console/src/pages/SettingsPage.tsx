import React from 'react'
import {
  Box,
  Container,
  Text,
  Stack,
  Paper,
  Group,
  Button,
  SegmentedControl,
} from '@mantine/core'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { useMantineColorScheme } from '@mantine/core'
import { Sun, Moon, Monitor, RefreshCw } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'

export const SettingsPage: React.FunctionComponent = () => {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const { counts, loading, error, refresh } = usePikkuMeta()

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Box>
          <Text size="xl" fw={700}>
            Settings
          </Text>
          <Text size="sm" c="dimmed">
            Application preferences and metadata status
          </Text>
        </Box>

        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Text fw={600}>Appearance</Text>
            <Group justify="space-between" align="center">
              <Text size="sm">Color scheme</Text>
              <SegmentedControl
                value={colorScheme}
                onChange={(value) =>
                  setColorScheme(value as 'light' | 'dark' | 'auto')
                }
                data={[
                  {
                    label: (
                      <Group gap={4}>
                        <Sun size={14} />
                        <span>Light</span>
                      </Group>
                    ),
                    value: 'light',
                  },
                  {
                    label: (
                      <Group gap={4}>
                        <Moon size={14} />
                        <span>Dark</span>
                      </Group>
                    ),
                    value: 'dark',
                  },
                  {
                    label: (
                      <Group gap={4}>
                        <Monitor size={14} />
                        <span>Auto</span>
                      </Group>
                    ),
                    value: 'auto',
                  },
                ]}
              />
            </Group>
          </Stack>
        </Paper>

        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600}>Metadata</Text>
              <Button
                variant="light"
                size="xs"
                leftSection={<RefreshCw size={14} />}
                loading={loading}
                onClick={refresh}
              >
                Refresh
              </Button>
            </Group>
            {error && (
              <Text size="sm" c="red">
                {error}
              </Text>
            )}
            <Group gap="lg" style={{ flexWrap: 'wrap' }}>
              <MetaStat label="Functions" count={counts.functions} />
              <MetaStat label="Workflows" count={counts.workflows} />
              <MetaStat label="HTTP Routes" count={counts.httpRoutes} />
              <MetaStat label="Channels" count={counts.channels} />
              <MetaStat label="MCP Tools" count={counts.mcpTools} />
              <MetaStat label="CLI Commands" count={counts.cliCommands} />
              <MetaStat label="Schedulers" count={counts.schedulers} />
              <MetaStat label="Queues" count={counts.queues} />
              <MetaStat label="RPC Methods" count={counts.rpcMethods} />
            </Group>
          </Stack>
        </Paper>

        <Paper p="lg" radius="md" withBorder>
          <Stack gap="md">
            <Text fw={600}>About</Text>
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                Pikku Console
              </Text>
              <PikkuBadge type="label">Alpha</PikkuBadge>
            </Group>
            <Text size="xs" c="dimmed">
              A visual explorer for Pikku project metadata. Browse functions,
              workflows, APIs, jobs, runtime services, and configuration.
            </Text>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}

const MetaStat: React.FunctionComponent<{
  label: string
  count: number
}> = ({ label, count }) => (
  <Box>
    <Text size="lg" fw={700}>
      {count}
    </Text>
    <Text size="xs" c="dimmed">
      {label}
    </Text>
  </Box>
)
