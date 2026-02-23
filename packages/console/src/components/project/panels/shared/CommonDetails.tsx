import React from 'react'
import { Text, Box, Group, Divider, Table, Anchor } from '@mantine/core'
import { Link } from 'react-router-dom'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { LinkedBadge } from '@/components/project/panels/LinkedBadge'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { SectionLabel } from './SectionLabel'
import { FunctionLink } from './FunctionLink'
import { SchemaSection } from './SchemaSection'

const SESSION_WIRES = new Set([
  'session',
  'setSession',
  'clearSession',
  'getSession',
  'hasSessionChanged',
])

interface CommonDetailsProps {
  description?: string | null
  pikkuFuncId?: string
  functionLinkLabel?: string
  services?: string[]
  wires?: { optimized: boolean; wires: string[] }
  middleware?: any[]
  permissions?: any[]
  tags?: string[]
  errors?: string[]
  functionName?: string
  inputSchemaName?: string | null
  outputSchemaName?: string | null
  children?: React.ReactNode
}

const TYPE_HREF: Record<string, string> = {
  http: '/apis/http',
  channel: '/apis/channels',
  mcp: '/apis/mcp',
  cli: '/apis/cli',
  rpc: '/apis/http',
  scheduler: '/jobs/schedulers',
  queue: '/jobs/queues',
  trigger: '/jobs/triggers',
  triggerSource: '/jobs/triggers',
  agent: '/agents',
}

const WiredToSection: React.FunctionComponent<{ functionName: string }> = ({
  functionName,
}) => {
  const { functionUsedBy } = usePikkuMeta()
  const usedBy = functionUsedBy.get(functionName)
  const allWirings = usedBy ? [...usedBy.transports, ...usedBy.jobs] : []

  if (allWirings.length === 0) return null

  return (
    <Box>
      <SectionLabel>Wired To ({allWirings.length})</SectionLabel>
      <Table verticalSpacing={4} horizontalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th c="dimmed" fw={500} fz="xs">
              Name
            </Table.Th>
            <Table.Th c="dimmed" fw={500} fz="xs">
              Type
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {allWirings.map((w) => (
            <Table.Tr key={w.id}>
              <Table.Td>
                <Anchor
                  component={Link}
                  to={TYPE_HREF[w.type] || '#'}
                  underline="never"
                  size="sm"
                  ff="monospace"
                >
                  {w.name}
                </Anchor>
              </Table.Td>
              <Table.Td>
                <PikkuBadge type="wiringType" value={w.type} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  )
}

export const CommonDetails: React.FunctionComponent<CommonDetailsProps> = ({
  description,
  pikkuFuncId,
  functionLinkLabel,
  services,
  wires,
  middleware,
  permissions,
  tags,
  errors,
  functionName,
  inputSchemaName,
  outputSchemaName,
  children,
}) => {
  const hasSchemas = !!(inputSchemaName || outputSchemaName)

  return (
    <>
      {description !== undefined && (
        <Box>
          <SectionLabel>Description</SectionLabel>
          {description ? (
            <Text size="md">{description}</Text>
          ) : (
            <Text size="md" c="dimmed">
              No description
            </Text>
          )}
        </Box>
      )}

      <FunctionLink pikkuFuncId={pikkuFuncId} label={functionLinkLabel} />

      {services !== undefined && (
        <Box>
          <SectionLabel>Services</SectionLabel>
          {services.length > 0 ? (
            <Group gap={6}>
              {services.map((svc: string) => (
                <PikkuBadge
                  key={svc}
                  type="dynamic"
                  badge="service"
                  value={svc}
                />
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              None
            </Text>
          )}
        </Box>
      )}

      <Box>
        <SectionLabel>Wires</SectionLabel>
        {wires && wires.wires.length > 0 ? (
          <Group gap={6}>
            {wires.wires.some((w) => SESSION_WIRES.has(w)) && (
              <PikkuBadge type="flag" flag="session" />
            )}
            {wires.wires
              .filter((w) => !SESSION_WIRES.has(w))
              .map((w: string) => (
                <PikkuBadge key={w} type="dynamic" badge="wire" value={w} />
              ))}
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            None
          </Text>
        )}
      </Box>

      {middleware !== undefined && (
        <Box>
          <SectionLabel>Middleware</SectionLabel>
          {middleware.length > 0 ? (
            <Group gap={6}>
              {middleware.map((mw: any, i: number) => (
                <LinkedBadge key={i} item={mw} kind="middleware" />
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              None
            </Text>
          )}
        </Box>
      )}

      {permissions !== undefined && (
        <Box>
          <SectionLabel>Permissions</SectionLabel>
          {permissions.length > 0 ? (
            <Group gap={6}>
              {permissions.map((perm: any, i: number) => (
                <LinkedBadge key={i} item={perm} kind="permission" />
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              None
            </Text>
          )}
        </Box>
      )}

      {tags !== undefined && (
        <Box>
          <SectionLabel>Tags</SectionLabel>
          {tags.length > 0 ? (
            <Group gap={6}>
              {tags.map((tag: string, i: number) => (
                <PikkuBadge key={i} type="dynamic" badge="tag" value={tag} />
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              None
            </Text>
          )}
        </Box>
      )}

      {errors !== undefined && (
        <Box>
          <SectionLabel>Errors</SectionLabel>
          {errors.length > 0 ? (
            <Group gap={6}>
              {errors.map((err: string, i: number) => (
                <PikkuBadge key={i} type="dynamic" badge="error" value={err} />
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              None
            </Text>
          )}
        </Box>
      )}

      {functionName && <WiredToSection functionName={functionName} />}

      {hasSchemas && (
        <>
          <Divider />
          <SchemaSection label="Input" schemaName={inputSchemaName} />
          <SchemaSection label="Output" schemaName={outputSchemaName} />
        </>
      )}

      {children}
    </>
  )
}
