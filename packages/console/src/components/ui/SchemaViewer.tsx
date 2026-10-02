import React, { useState } from 'react'
import { Badge, Box, Group, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { schemaTypeColor } from './badge-defs'
import classes from './console.module.css'

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
  const variants = prop.anyOf || prop.oneOf
  if (variants) {
    const main = variants.find((v: any) => v.type && v.type !== 'null')
    return schemaTypeColor(main?.enum ? 'enum' : (main?.type ?? 'any'))
  }
  if (Array.isArray(prop.type)) {
    return schemaTypeColor(prop.type.find((t: string) => t !== 'null') ?? 'any')
  }
  return schemaTypeColor(prop.type)
}

const getNotes = (prop: any): string | null => {
  if (prop.enum) return prop.enum.join(' | ')
  if (prop.description) return prop.description
  if (prop.format) return prop.format
  return null
}

const PropertyRow: React.FC<{
  name: string
  prop: any
  required: boolean
  depth: number
}> = ({ name, prop, required, depth }) => {
  const [expanded, setExpanded] = useState(depth < 1)
  const shape =
    (prop.anyOf || prop.oneOf)?.find(
      (v: any) => v.type === 'object' && v.properties
    ) ?? prop
  const hasChildren = shape.type === 'object' && shape.properties
  const hasArrayChildren =
    prop.type === 'array' &&
    prop.items?.type === 'object' &&
    prop.items?.properties
  const isExpandable = hasChildren || hasArrayChildren
  const childSchema = hasChildren ? shape : hasArrayChildren ? prop.items : null
  const notes = getNotes(prop)

  return (
    <>
      <Box
        className={classes.schemaField}
        data-expandable={isExpandable || undefined}
        onClick={() => isExpandable && setExpanded(!expanded)}
        style={{ paddingLeft: depth * 16 + 12 }}
      >
        <Group gap={8} wrap="nowrap">
          {isExpandable ? (
            expanded ? (
              <ChevronDown size={12} color="var(--app-text-dim)" />
            ) : (
              <ChevronRight size={12} color="var(--app-text-dim)" />
            )
          ) : (
            <Box w={12} style={{ flexShrink: 0 }} />
          )}
          <Text size="sm" ff="monospace" fw={500} c="var(--app-text)" truncate>
            {asI18n(name)}
          </Text>
          <Badge size="sm" variant="light" color={getColor(prop)} tt="none">
            {asI18n(getTypeLabel(prop))}
          </Badge>
          {required && (
            <Text size="xs" c="dimmed">
              {m.schema_viewer_required()}
            </Text>
          )}
        </Group>
        {notes && (
          <Text size="sm" c="var(--app-text-dim)" mt={4} pl={20}>
            {asI18n(notes)}
          </Text>
        )}
      </Box>
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

const PropertyRows: React.FC<{
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

export const SchemaViewer: React.FC<SchemaViewerProps> = ({ schema }) => {
  useLocale()
  if (!schema || typeof schema !== 'object') {
    return (
      <Text c="dimmed" size="sm">
        {m.schema_viewer_no_schema()}
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
    const items = schema.items.$ref
      ? resolveRef(schema.items.$ref)
      : schema.items
    if (items) resolvedSchema = items
  }

  const properties =
    resolvedSchema.properties || (resolvedSchema.type ? null : resolvedSchema)
  if (!properties) {
    return (
      <Badge
        size="sm"
        variant="light"
        color={getColor(resolvedSchema)}
        tt="none"
      >
        {asI18n(getTypeLabel(schema))}
      </Badge>
    )
  }

  if (Object.keys(properties).length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {m.schema_viewer_no_fields()}
      </Text>
    )
  }

  return (
    <Box className={classes.schemaFields}>
      <PropertyRows
        properties={properties}
        required={resolvedSchema.required || []}
        depth={0}
      />
    </Box>
  )
}
