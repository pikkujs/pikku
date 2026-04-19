import React, { useState } from 'react'
import { Box, Text, Table, Badge } from '@mantine/core'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { schemaTypeColor } from './badge-defs'

interface SchemaViewerProps {
  schema: any
}

const getTypeLabel = (prop: any): string => {
  if (prop.enum) return 'enum'
  if (prop.type === 'array' && prop.items) {
    const itemType = prop.items.type || 'any'
    return `${itemType}[]`
  }
  if (prop.anyOf || prop.oneOf) {
    const variants = prop.anyOf || prop.oneOf
    return variants.map((v: any) => v.type || 'any').join(' | ')
  }
  return prop.type || 'any'
}

const getColor = (prop: any): string => {
  if (prop.enum) return schemaTypeColor('enum')
  return schemaTypeColor(prop.type)
}

const getNotes = (prop: any): string | null => {
  if (prop.enum) return prop.enum.join(' | ')
  if (prop.description) return prop.description
  if (prop.format) return prop.format
  return null
}

const PropertyRow: React.FunctionComponent<{
  name: string
  prop: any
  required: boolean
  depth: number
}> = ({ name, prop, required, depth }) => {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = prop.type === 'object' && prop.properties
  const hasArrayChildren =
    prop.type === 'array' &&
    prop.items?.type === 'object' &&
    prop.items?.properties
  const isExpandable = hasChildren || hasArrayChildren
  const childSchema = hasChildren ? prop : hasArrayChildren ? prop.items : null
  const notes = getNotes(prop)

  return (
    <>
      <Table.Tr
        onClick={() => isExpandable && setExpanded(!expanded)}
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
              {name}
              {required && (
                <Text component="span" c="yellow" fw={700}>
                  *
                </Text>
              )}
            </Text>
          </Box>
        </Table.Td>
        <Table.Td>
          <Badge size="sm" variant="light" color={getColor(prop)} tt="none">
            {getTypeLabel(prop)}
          </Badge>
        </Table.Td>
        <Table.Td>
          {notes && (
            <Text size="xs" c="var(--app-meta-label)">
              {notes}
            </Text>
          )}
        </Table.Td>
      </Table.Tr>
      {isExpandable && expanded && childSchema?.properties && (
        <PropertyRows
          properties={childSchema.properties}
          required={childSchema.required || []}
          depth={depth + 1}
        />
      )}
    </>
  )
}

const PropertyRows: React.FunctionComponent<{
  properties: Record<string, any>
  required: string[]
  depth: number
}> = ({ properties, required, depth }) => (
  <>
    {Object.entries(properties).map(([name, prop]) => (
      <PropertyRow
        key={name}
        name={name}
        prop={prop}
        required={required.includes(name)}
        depth={depth}
      />
    ))}
  </>
)

export const SchemaViewer: React.FunctionComponent<SchemaViewerProps> = ({
  schema,
}) => {
  if (!schema || typeof schema !== 'object') {
    return (
      <Text c="dimmed" size="sm">
        No schema
      </Text>
    )
  }

  const resolveRef = (ref: string): any => {
    if (!ref.startsWith('#/definitions/')) return null
    const name = ref.replace('#/definitions/', '')
    return schema.definitions?.[name] || null
  }

  let resolvedSchema = schema
  if (schema.type === 'array' && schema.items) {
    const items = schema.items.$ref ? resolveRef(schema.items.$ref) : schema.items
    if (items) resolvedSchema = items
  }

  const properties = resolvedSchema.properties || (resolvedSchema.type ? null : resolvedSchema)
  if (!properties) {
    return (
      <Badge size="sm" variant="light" color={getColor(resolvedSchema)} tt="none">
        {getTypeLabel(schema)}
      </Badge>
    )
  }

  return (
    <Table
      verticalSpacing={6}
      horizontalSpacing="sm"
      layout="fixed"
      styles={{
        table: {
          tableLayout: 'fixed',
        },
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
      <colgroup>
        <col />
        <col style={{ width: 150 }} />
        <col />
      </colgroup>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Field</Table.Th>
          <Table.Th>Type</Table.Th>
          <Table.Th>Notes</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        <PropertyRows
          properties={properties}
          required={resolvedSchema.required || []}
          depth={0}
        />
      </Table.Tbody>
    </Table>
  )
}
