import React from 'react'
import { Stack, Text, Box, Code, Group, Table } from '@mantine/core'
import {
  Globe,
  Radio,
  FunctionSquare,
  Clock,
  ListOrdered,
  Terminal,
  Cpu,
  Zap,
} from 'lucide-react'
import cronstrue from 'cronstrue'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { CommonDetails } from '@/components/project/panels/shared/CommonDetails'
import { FunctionLink } from '@/components/project/panels/shared/FunctionLink'
import { LinkedBadge } from '@/components/project/panels/LinkedBadge'
import { SectionLabel } from '@/components/project/panels/shared/SectionLabel'
import { SchemaSection } from '@/components/project/panels/shared/SchemaSection'
import { usePanelContext } from '@/context/PanelContext'

interface WiringPanelProps {
  wireId: string
  metadata?: any
}

export const HttpConfiguration: React.FunctionComponent<WiringPanelProps> = ({
  wireId,
  metadata = {},
}) => {
  const method = metadata?.method?.toUpperCase() || 'GET'
  const route = metadata?.route || wireId
  const middleware = metadata?.middleware || []
  const permissions = metadata?.permissions || []
  const hasAuth = metadata?.auth !== false

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Globe size={20} />
          <PikkuBadge type="httpMethod" value={method} variant="filled" />
          <Text size="lg" ff="monospace" fw={600}>
            {route}
          </Text>
        </Group>
        {metadata?.summary && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.summary}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        {hasAuth && <PikkuBadge type="flag" flag="auth" />}
        {permissions.length > 0 && (
          <PikkuBadge type="flag" flag="permissioned" />
        )}
        {metadata?.sse && <PikkuBadge type="flag" flag="sse" />}
      </Group>

      {((metadata?.params && metadata.params.length > 0) ||
        (metadata?.query && metadata.query.length > 0)) && (
        <Group gap="xs">
          {metadata?.params?.map((p: string) => (
            <PikkuBadge
              key={`p-${p}`}
              type="dynamic"
              badge="param"
              value={`:${p}`}
            />
          ))}
          {metadata?.query?.map((q: string) => (
            <PikkuBadge
              key={`q-${q}`}
              type="dynamic"
              badge="query"
              value={`?${q}`}
            />
          ))}
        </Group>
      )}

      <CommonDetails
        description={metadata?.description}
        pikkuFuncId={metadata?.pikkuFuncId}
        middleware={middleware}
        permissions={permissions}
        tags={metadata?.tags || []}
        errors={metadata?.errors || []}
        inputSchemaName={metadata?.inputSchemaName}
        outputSchemaName={metadata?.outputSchemaName}
      />
    </Stack>
  )
}

export const ChannelConfiguration: React.FunctionComponent<
  WiringPanelProps
> = ({ wireId, metadata = {} }) => {
  const { navigateInPanel } = usePanelContext()
  const middleware = metadata?.middleware || []
  const permissions = metadata?.permissions || []
  const channelMiddleware = metadata?.channelMiddleware || []
  const hasAuth = metadata?.auth !== false
  const messageWirings = metadata?.messageWirings as
    | Record<string, Record<string, any>>
    | undefined

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Radio size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {metadata?.name || wireId}
          </Text>
        </Group>
        {metadata?.route && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.route}
          </Text>
        )}
        {metadata?.summary && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.summary}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <PikkuBadge type="wiringType" value="channel" />
        {hasAuth && <PikkuBadge type="flag" flag="auth" />}
        {permissions.length > 0 && (
          <PikkuBadge type="flag" flag="permissioned" />
        )}
      </Group>

      {((metadata?.params && metadata.params.length > 0) ||
        (metadata?.query && metadata.query.length > 0)) && (
        <Group gap="xs">
          {metadata?.params?.map((p: string) => (
            <PikkuBadge
              key={`p-${p}`}
              type="dynamic"
              badge="param"
              value={`:${p}`}
            />
          ))}
          {metadata?.query?.map((q: string) => (
            <PikkuBadge
              key={`q-${q}`}
              type="dynamic"
              badge="query"
              value={`?${q}`}
            />
          ))}
        </Group>
      )}

      <CommonDetails
        description={metadata?.description}
        middleware={middleware}
        permissions={permissions}
        tags={metadata?.tags || []}
        errors={metadata?.errors || []}
      >
        {metadata?.input && (
          <SchemaSection label="Input Schema" schemaName={metadata.input} />
        )}

        <FunctionLink
          pikkuFuncId={metadata?.connect?.pikkuFuncId}
          label="Connect Handler"
        />
        <FunctionLink
          pikkuFuncId={metadata?.disconnect?.pikkuFuncId}
          label="Disconnect Handler"
        />
        <FunctionLink
          pikkuFuncId={metadata?.message?.pikkuFuncId}
          label="Message Handler"
        />

        {channelMiddleware.length > 0 && (
          <Box>
            <SectionLabel>Channel Middleware</SectionLabel>
            <Group gap={6}>
              {channelMiddleware.map((mw: any, i: number) => (
                <LinkedBadge key={i} item={mw} kind="middleware" />
              ))}
            </Group>
          </Box>
        )}

        {messageWirings && Object.keys(messageWirings).length > 0 && (
          <Box>
            <SectionLabel>Message Wirings</SectionLabel>
            <Stack gap="sm">
              {Object.entries(messageWirings).map(([category, actions]) => (
                <Box key={category}>
                  <Text size="sm" fw={600} mb={4}>
                    {category}
                  </Text>
                  <Group gap={6}>
                    {Object.entries(actions).map(([actionName, actionData]) => (
                      <PikkuBadge
                        key={actionName}
                        type="dynamic"
                        badge="actions"
                        value={actionName}
                        style={{
                          cursor: actionData?.pikkuFuncId
                            ? 'pointer'
                            : undefined,
                        }}
                        onClick={
                          actionData?.pikkuFuncId
                            ? () =>
                                navigateInPanel(
                                  'function',
                                  actionData.pikkuFuncId,
                                  actionName,
                                  actionData
                                )
                            : undefined
                        }
                      />
                    ))}
                  </Group>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </CommonDetails>
    </Stack>
  )
}

export const RpcConfiguration: React.FunctionComponent<WiringPanelProps> = ({
  wireId,
  metadata = {},
}) => {
  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <FunctionSquare size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {wireId}
          </Text>
        </Group>
      </Box>

      <Group gap="xs">
        <PikkuBadge type="wiringType" value="rpc" />
      </Group>

      <CommonDetails pikkuFuncId={metadata?.pikkuFuncId} />
    </Stack>
  )
}

export const SchedulerConfiguration: React.FunctionComponent<
  WiringPanelProps
> = ({ wireId, metadata = {} }) => {
  const middleware = metadata?.middleware || []
  const permissions = metadata?.permissions || []

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Clock size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {metadata?.name || wireId}
          </Text>
        </Group>
        {metadata?.summary && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.summary}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <PikkuBadge type="wiringType" value="scheduler" />
        {permissions.length > 0 && (
          <PikkuBadge type="flag" flag="permissioned" />
        )}
      </Group>

      {metadata?.schedule && (
        <Box>
          <SectionLabel>Schedule</SectionLabel>
          <Text size="sm">{cronstrue.toString(metadata.schedule)}</Text>
          <Text size="xs" c="dimmed" ff="monospace" mt={2}>
            {metadata.schedule}
          </Text>
        </Box>
      )}

      {metadata?.timezone && (
        <Box>
          <SectionLabel>Timezone</SectionLabel>
          <Text size="sm">{metadata.timezone}</Text>
        </Box>
      )}

      <CommonDetails
        description={metadata?.description}
        pikkuFuncId={metadata?.pikkuFuncId}
        middleware={middleware}
        permissions={permissions}
        tags={metadata?.tags || []}
        errors={metadata?.errors || []}
      />
    </Stack>
  )
}

export const QueueConfiguration: React.FunctionComponent<WiringPanelProps> = ({
  wireId,
  metadata = {},
}) => {
  const middleware = metadata?.middleware || []
  const permissions = metadata?.permissions || []
  const config = metadata?.config as Record<string, any> | undefined

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <ListOrdered size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {metadata?.name || wireId}
          </Text>
        </Group>
        {metadata?.summary && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.summary}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <PikkuBadge type="wiringType" value="queue" />
        {metadata?.concurrency !== undefined && (
          <PikkuBadge
            type="dynamic"
            badge="concurrency"
            value={metadata.concurrency}
            variant="outline"
            color="gray"
          />
        )}
        {permissions.length > 0 && (
          <PikkuBadge type="flag" flag="permissioned" />
        )}
      </Group>

      <CommonDetails
        description={metadata?.description}
        pikkuFuncId={metadata?.pikkuFuncId}
        middleware={middleware}
        permissions={permissions}
        tags={metadata?.tags || []}
        errors={metadata?.errors || []}
      >
        {config && Object.keys(config).length > 0 && (
          <Box>
            <SectionLabel>Config</SectionLabel>
            <Group gap={6}>
              {Object.entries(config).map(([key, value]) => (
                <PikkuBadge
                  key={key}
                  type="label"
                  size="sm"
                  variant="outline"
                  color="gray"
                >
                  {key}: {String(value)}
                </PikkuBadge>
              ))}
            </Group>
          </Box>
        )}
      </CommonDetails>
    </Stack>
  )
}

const CliOptionsTable: React.FunctionComponent<{
  options: Record<string, any>
}> = ({ options }) => {
  const entries = Object.entries(options)
  if (entries.length === 0) return null

  return (
    <Table verticalSpacing={4} horizontalSpacing="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th c="dimmed" fw={500} fz="xs">
            Option
          </Table.Th>
          <Table.Th c="dimmed" fw={500} fz="xs">
            Description
          </Table.Th>
          <Table.Th c="dimmed" fw={500} fz="xs">
            Default
          </Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map(([name, opt]) => (
          <Table.Tr key={name}>
            <Table.Td>
              <Text size="sm" ff="monospace">
                --{name}
                {opt.short ? `, -${opt.short}` : ''}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{opt.description || ''}</Text>
            </Table.Td>
            <Table.Td>
              {opt.required ? (
                <PikkuBadge type="flag" flag="required" />
              ) : opt.default !== undefined ? (
                <Code>{String(opt.default)}</Code>
              ) : (
                <Text size="sm" c="dimmed">
                  -
                </Text>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

const CliCommandTree: React.FunctionComponent<{
  commands: Record<string, any>
  depth?: number
}> = ({ commands, depth = 0 }) => {
  const { navigateInPanel } = usePanelContext()

  return (
    <Stack gap="xs">
      {Object.entries(commands).map(([name, cmd]) => (
        <Box key={name} ml={depth * 16}>
          <Group gap={6} mb={4}>
            <Text size="sm" ff="monospace" fw={600}>
              {name}
            </Text>
            {cmd.isDefault && (
              <PikkuBadge type="label" size="sm" variant="light" color="gray">
                default
              </PikkuBadge>
            )}
            {cmd.pikkuFuncId && (
              <PikkuBadge
                type="label"
                size="sm"
                variant="outline"
                color="gray"
                style={{ cursor: 'pointer' }}
                onClick={() =>
                  navigateInPanel(
                    'function',
                    cmd.pikkuFuncId,
                    cmd.pikkuFuncId,
                    cmd
                  )
                }
              >
                {cmd.pikkuFuncId}
              </PikkuBadge>
            )}
          </Group>
          {cmd.description && (
            <Text size="xs" c="dimmed" mb={4}>
              {cmd.description}
            </Text>
          )}
          {cmd.positionals && cmd.positionals.length > 0 && (
            <Group gap={6} mb={4}>
              {cmd.positionals.map((pos: any) => (
                <PikkuBadge
                  key={pos.name}
                  type="label"
                  size="sm"
                  variant="outline"
                  color={pos.required ? 'red' : 'gray'}
                >
                  {pos.variadic ? `...${pos.name}` : pos.name}
                  {pos.required ? '*' : ''}
                </PikkuBadge>
              ))}
            </Group>
          )}
          {cmd.options && Object.keys(cmd.options).length > 0 && (
            <CliOptionsTable options={cmd.options} />
          )}
          {cmd.subcommands && Object.keys(cmd.subcommands).length > 0 && (
            <CliCommandTree commands={cmd.subcommands} depth={depth + 1} />
          )}
        </Box>
      ))}
    </Stack>
  )
}

export const CliConfiguration: React.FunctionComponent<WiringPanelProps> = ({
  wireId,
  metadata = {},
}) => {
  const program = metadata?.program || wireId
  const commands = metadata?.commands as Record<string, any> | undefined
  const globalOptions = metadata?.options as Record<string, any> | undefined

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Terminal size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {program}
          </Text>
        </Group>
        {metadata?.summary && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.summary}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <PikkuBadge type="wiringType" value="cli" />
        {metadata?.defaultRenderName && (
          <PikkuBadge
            type="dynamic"
            badge="format"
            value={metadata.defaultRenderName}
          />
        )}
      </Group>

      <CommonDetails description={metadata?.description}>
        {globalOptions && Object.keys(globalOptions).length > 0 && (
          <Box>
            <SectionLabel>Global Options</SectionLabel>
            <CliOptionsTable options={globalOptions} />
          </Box>
        )}

        {commands && Object.keys(commands).length > 0 && (
          <Box>
            <SectionLabel>Commands</SectionLabel>
            <CliCommandTree commands={commands} />
          </Box>
        )}
      </CommonDetails>
    </Stack>
  )
}

export const McpConfiguration: React.FunctionComponent<WiringPanelProps> = ({
  wireId,
  metadata = {},
}) => {
  const method = metadata?.method || 'unknown'
  const middleware = metadata?.middleware || []
  const permissions = metadata?.permissions || []
  const args = metadata?.arguments as
    | Array<{ name: string; description?: string; required?: boolean }>
    | undefined

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Cpu size={20} />
          <PikkuBadge type="mcpType" value={method} variant="filled" />
          <Text size="lg" ff="monospace" fw={600}>
            {metadata?.name || wireId}
          </Text>
        </Group>
        {metadata?.summary && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.summary}
          </Text>
        )}
      </Box>

      {metadata?.uri && (
        <Box>
          <SectionLabel>URI</SectionLabel>
          <Text size="sm" ff="monospace">
            {metadata.uri}
          </Text>
        </Box>
      )}

      <CommonDetails
        description={metadata?.description}
        pikkuFuncId={metadata?.pikkuFuncId}
        middleware={middleware}
        permissions={permissions}
        tags={metadata?.tags || []}
        errors={metadata?.errors || []}
        inputSchemaName={metadata?.inputSchemaName}
        outputSchemaName={metadata?.outputSchemaName}
      >
        {args && args.length > 0 && (
          <Box>
            <SectionLabel>Arguments</SectionLabel>
            <Table verticalSpacing={4} horizontalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th c="dimmed" fw={500} fz="xs">
                    Name
                  </Table.Th>
                  <Table.Th c="dimmed" fw={500} fz="xs">
                    Description
                  </Table.Th>
                  <Table.Th c="dimmed" fw={500} fz="xs">
                    Required
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {args.map((arg) => (
                  <Table.Tr key={arg.name}>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {arg.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{arg.description || ''}</Text>
                    </Table.Td>
                    <Table.Td>
                      {arg.required && (
                        <PikkuBadge type="flag" flag="required" />
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        )}
      </CommonDetails>
    </Stack>
  )
}

export const TriggerConfiguration: React.FunctionComponent<
  WiringPanelProps
> = ({ wireId, metadata = {} }) => {
  const middleware = metadata?.middleware || []
  const permissions = metadata?.permissions || []

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Zap size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {metadata?.name || wireId}
          </Text>
        </Group>
        {metadata?.summary && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.summary}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <PikkuBadge type="wiringType" value="trigger" />
        {permissions.length > 0 && (
          <PikkuBadge type="flag" flag="permissioned" />
        )}
      </Group>

      <CommonDetails
        description={metadata?.description}
        pikkuFuncId={metadata?.pikkuFuncId}
        middleware={middleware}
        permissions={permissions}
        tags={metadata?.tags || []}
        errors={metadata?.errors || []}
      />
    </Stack>
  )
}

export const TriggerSourceConfiguration: React.FunctionComponent<
  WiringPanelProps
> = ({ wireId, metadata = {} }) => {
  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Zap size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {metadata?.name || wireId}
          </Text>
        </Group>
        {metadata?.summary && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.summary}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <PikkuBadge type="wiringType" value="triggerSource" />
        {metadata?.packageName && (
          <PikkuBadge
            type="dynamic"
            badge="package"
            value={metadata.packageName}
          />
        )}
      </Group>

      <CommonDetails
        description={metadata?.description}
        pikkuFuncId={metadata?.pikkuFuncId}
      />
    </Stack>
  )
}
