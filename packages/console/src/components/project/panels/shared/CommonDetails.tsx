import React from 'react'
import {
  Text,
  Box,
  Group,
  Divider,
  Table,
  Anchor,
  Badge,
} from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useLink } from '../../../../router'
import { usePikkuMeta } from '../../../../context/PikkuMetaContext'
import { usePanelContext } from '../../../../context/PanelContext'
import { useFunctionMeta } from '../../../../hooks/useWirings'
import { LinkedBadge } from '../LinkedBadge'
import { PikkuBadge } from '../../../ui/PikkuBadge'
import { MetaRow } from '../../../ui/MetaRow'
import { SectionLabel } from '../../../ui/SectionLabel'
import { TagBadge, ServiceBadge } from '../../../ui/TagBadge'
import { SchemaSection } from './SchemaSection'
import classes from '../../../ui/console.module.css'

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
  functionLinkLabel?: I18nNode
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
  http: '/apis?tab=http',
  channel: '/apis?tab=channels',
  mcp: '/apis?tab=mcp',
  gateway: '/apis?tab=gateways',
  cli: '/apis?tab=cli',
  rpc: '/apis?tab=http',
  scheduler: '/jobs?tab=schedulers',
  queue: '/jobs?tab=queues',
  trigger: '/jobs?tab=triggers',
  triggerSource: '/jobs?tab=triggers',
  agent: '/agents',
}

const FunctionValue: React.FC<{ pikkuFuncId: string }> = ({ pikkuFuncId }) => {
  const { data: funcMeta } = useFunctionMeta(pikkuFuncId)
  const { navigateInPanel } = usePanelContext()
  const displayName = funcMeta?.name || pikkuFuncId

  return (
    <Text
      size="sm"
      fw={600}
      ff="monospace"
      c="var(--app-meta-value)"
      className={classes.clickableText}
      onClick={() =>
        navigateInPanel('function', pikkuFuncId, displayName, funcMeta)
      }
    >
      {asI18n(displayName)}
    </Text>
  )
}

const WiredToSection: React.FC<{ functionName: string }> = ({
  functionName,
}) => {
  useLocale()
  const Link = useLink()
  const { functionUsedBy } = usePikkuMeta()
  const usedBy = functionUsedBy.get(functionName)
  const allWirings = usedBy ? [...usedBy.transports, ...usedBy.jobs] : []

  if (allWirings.length === 0) return null

  return (
    <Box>
      <SectionLabel>
        {m.common_details_wired_to({ count: allWirings.length })}
      </SectionLabel>
      <Table verticalSpacing={4} horizontalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th
              c="var(--app-section-label)"
              fw={500}
              fz="xs"
              ff="monospace"
            >
              Name
            </Table.Th>
            <Table.Th
              c="var(--app-section-label)"
              fw={500}
              fz="xs"
              ff="monospace"
            >
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
                  {asI18n(w.name)}
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

export const CommonDetails: React.FC<CommonDetailsProps> = ({
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
  useLocale()
  const hasSchemas = !!(inputSchemaName || outputSchemaName)
  const filteredWires = wires?.wires.filter((w) => !SESSION_WIRES.has(w)) || []
  const hasSession = wires?.wires.some((w) => SESSION_WIRES.has(w)) || false

  return (
    <>
      {description != null && description !== '' && (
        <MetaRow label={m.common_details_description()} labelWidth={90}>
          <Text size="sm" c="var(--app-meta-value)">
            {asI18n(description)}
          </Text>
        </MetaRow>
      )}

      {pikkuFuncId && (
        <MetaRow
          label={functionLinkLabel ?? m.common_details_function()}
          labelWidth={90}
        >
          <FunctionValue pikkuFuncId={pikkuFuncId} />
        </MetaRow>
      )}

      {services && services.length > 0 && (
        <MetaRow label={m.common_details_services()} labelWidth={90}>
          <Group gap={4}>
            {services.map((svc: string) => (
              <ServiceBadge key={svc}>{asI18n(svc)}</ServiceBadge>
            ))}
          </Group>
        </MetaRow>
      )}

      {wires && wires.wires.length > 0 && (
        <MetaRow label={m.common_details_wires()} labelWidth={90}>
          <Group gap={4}>
            {hasSession && <PikkuBadge type="flag" flag="session" />}
            {filteredWires.map((w: string) => (
              <PikkuBadge key={w} type="dynamic" badge="wire" value={w} />
            ))}
          </Group>
        </MetaRow>
      )}

      {middleware && middleware.length > 0 && (
        <MetaRow label={m.common_details_middleware()} labelWidth={90}>
          <Group gap={4}>
            {middleware.map((mw: any, i: number) => (
              <LinkedBadge key={i} item={mw} kind="middleware" />
            ))}
          </Group>
        </MetaRow>
      )}

      {permissions && permissions.length > 0 && (
        <MetaRow label={m.common_details_permissions()} labelWidth={90}>
          <Group gap={4}>
            {permissions.map((perm: any, i: number) => (
              <LinkedBadge key={i} item={perm} kind="permission" />
            ))}
          </Group>
        </MetaRow>
      )}

      {tags && tags.length > 0 && (
        <MetaRow label={m.common_details_tags()} labelWidth={90}>
          <Group gap={4}>
            {tags.map((tag: string, i: number) => (
              <TagBadge key={i}>{asI18n(tag)}</TagBadge>
            ))}
          </Group>
        </MetaRow>
      )}

      {errors && errors.length > 0 && (
        <MetaRow label={m.common_details_errors()} labelWidth={90}>
          <Group gap={4}>
            {errors.map((err: string, i: number) => (
              <Badge key={i} size="sm" color="red" variant="light">
                {asI18n(err)}
              </Badge>
            ))}
          </Group>
        </MetaRow>
      )}

      {functionName && <WiredToSection functionName={functionName} />}

      {hasSchemas && (
        <>
          <Divider mt="sm" />
          <SchemaSection
            label={m.common_details_input()}
            schemaName={inputSchemaName}
          />
          <SchemaSection
            label={m.common_details_output()}
            schemaName={outputSchemaName}
          />
        </>
      )}

      {children}
    </>
  )
}
