import React, { useState } from 'react'
import { Box, Text, Table, Badge } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const ValueInline: React.FC<{ value: unknown }> = ({ value }) => {
  if (value === null || value === undefined) {
    return (
      <Text size="sm" ff="monospace" c="dimmed" fs="italic">
        {asI18n('null')}
      </Text>
    )
  }
  if (typeof value === 'string') {
    return (
      <Text size="sm" ff="monospace" c="teal.4">
        {asI18n(`"${value}"`)}
      </Text>
    )
  }
  if (typeof value === 'number') {
    return (
      <Text size="sm" ff="monospace" c="orange.4">
        {value}
      </Text>
    )
  }
  if (typeof value === 'boolean') {
    return (
      <Badge size="sm" variant="light" color={value ? 'green' : 'red'}>
        {asI18n(String(value))}
      </Badge>
    )
  }
  if (Array.isArray(value)) {
    return (
      <Text size="sm" ff="monospace" c="dimmed">
        {asI18n(`[${value.length}]`)}
      </Text>
    )
  }
  if (typeof value === 'object') {
    const count = Object.keys(value as object).length
    return (
      <Text size="sm" ff="monospace" c="dimmed">
        {asI18n(`{${count}}`)}
      </Text>
    )
  }
  return (
    <Text size="sm" ff="monospace">
      {asI18n(String(value))}
    </Text>
  )
}

const DataRow: React.FC<{ name: string; value: unknown; depth: number }> = ({
  name,
  value,
  depth,
}) => {
  const isObject =
    typeof value === 'object' && value !== null && !Array.isArray(value)
  const isArray = Array.isArray(value)
  const isExpandable =
    (isObject && Object.keys(value as object).length > 0) ||
    (isArray && (value as unknown[]).length > 0)
  const [expanded, setExpanded] = useState(depth < 1 && isExpandable)
  const childEntries: [string, unknown][] = isObject
    ? Object.entries(value as Record<string, unknown>)
    : isArray
      ? (value as unknown[]).map((v, i) => [String(i), v])
      : []

  return (
    <>
      <Table.Tr
        onClick={() => isExpandable && setExpanded((prev) => !prev)}
        style={{ cursor: isExpandable ? 'pointer' : 'default' }}
      >
        <Table.Td style={{ paddingLeft: depth * 20 + 8 }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {isExpandable ? (
              expanded ? (
                <ChevronDown size={12} color="var(--app-meta-label)" />
              ) : (
                <ChevronRight size={12} color="var(--app-meta-label)" />
              )
            ) : (
              <Box w={12} />
            )}
            <Text size="sm" ff="monospace" fw={500} c="var(--app-meta-value)">
              {asI18n(name)}
            </Text>
          </Box>
        </Table.Td>
        <Table.Td>
          <ValueInline value={value} />
        </Table.Td>
      </Table.Tr>
      {isExpandable &&
        expanded &&
        childEntries.map(([k, v]) => (
          <DataRow key={k} name={k} value={v} depth={depth + 1} />
        ))}
    </>
  )
}

export const DataViewer: React.FC<{ data: unknown }> = ({ data }) => {
  if (data === null || data === undefined) {
    return (
      <Text c="dimmed" size="sm" fs="italic">
        {asI18n('null')}
      </Text>
    )
  }
  if (typeof data !== 'object') {
    return <ValueInline value={data} />
  }
  const entries: [string, unknown][] = Array.isArray(data)
    ? (data as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(data as Record<string, unknown>)
  if (entries.length === 0) {
    return (
      <Text c="dimmed" size="sm" fs="italic">
        {asI18n(Array.isArray(data) ? '[ ]' : '{ }')}
      </Text>
    )
  }
  return (
    <Table
      verticalSpacing={4}
      horizontalSpacing="sm"
      styles={{
        th: {
          color: 'var(--app-section-label)',
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          borderBottom: '1px solid var(--app-row-border)',
        },
        td: {
          borderBottom: '1px solid var(--app-row-border)',
        },
      }}
    >
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Field</Table.Th>
          <Table.Th>Value</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map(([k, v]) => (
          <DataRow key={k} name={k} value={v} depth={0} />
        ))}
      </Table.Tbody>
    </Table>
  )
}
