import React, { useState } from 'react'
import { Box, Text, Group, Stack, UnstyledButton } from '@mantine/core'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { schemaTypeColor } from '@/components/ui/badge-defs'

interface SchemaViewerProps {
  schema: any
}

const getTypeLabel = (prop: any): string => {
  if (prop.enum) {
    return `enum`
  }
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

  return (
    <Box>
      <UnstyledButton
        onClick={() => isExpandable && setExpanded(!expanded)}
        style={{ width: '100%', cursor: isExpandable ? 'pointer' : 'default' }}
      >
        <Group
          gap="xs"
          py={6}
          style={{
            paddingLeft: depth * 20 + 8,
            paddingRight: 8,
            borderBottom: '1px solid var(--mantine-color-gray-2)',
          }}
        >
          {isExpandable ? (
            expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )
          ) : (
            <Box w={12} />
          )}
          <Text size="sm" ff="monospace" fw={500} style={{ minWidth: 80 }}>
            {name}
            {required && (
              <Text
                component="span"
                c="red"
                fw={700}
                style={{ verticalAlign: 'top', fontSize: '0.6em' }}
              >
                {' '}
                *
              </Text>
            )}
          </Text>
          <PikkuBadge type="label" color={getColor(prop)}>
            {getTypeLabel(prop)}
          </PikkuBadge>
          {prop.enum && (
            <Text size="xs" c="dimmed" truncate style={{ maxWidth: 200 }}>
              {prop.enum.join(' | ')}
            </Text>
          )}
          {prop.format && (
            <PikkuBadge type="dynamic" badge="format" value={prop.format} />
          )}
          {prop.description && (
            <Text size="xs" c="dimmed" truncate style={{ flex: 1 }}>
              {prop.description}
            </Text>
          )}
        </Group>
      </UnstyledButton>
      {isExpandable && expanded && childSchema?.properties && (
        <PropertyList
          properties={childSchema.properties}
          required={childSchema.required || []}
          depth={depth + 1}
        />
      )}
    </Box>
  )
}

const PropertyList: React.FunctionComponent<{
  properties: Record<string, any>
  required: string[]
  depth: number
}> = ({ properties, required, depth }) => {
  return (
    <Box>
      {Object.entries(properties).map(([name, prop]) => (
        <PropertyRow
          key={name}
          name={name}
          prop={prop}
          required={required.includes(name)}
          depth={depth}
        />
      ))}
    </Box>
  )
}

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

  if (schema.type === 'object' && schema.properties) {
    return (
      <Stack gap={0}>
        <PropertyList
          properties={schema.properties}
          required={schema.required || []}
          depth={0}
        />
      </Stack>
    )
  }

  if (schema.type && !schema.properties) {
    return (
      <Group gap="xs">
        <PikkuBadge type="label" color={getColor(schema)}>
          {getTypeLabel(schema)}
        </PikkuBadge>
        {schema.description && (
          <Text size="sm" c="dimmed">
            {schema.description}
          </Text>
        )}
      </Group>
    )
  }

  return (
    <Stack gap={0}>
      <PropertyList
        properties={schema.properties || schema}
        required={schema.required || []}
        depth={0}
      />
    </Stack>
  )
}
