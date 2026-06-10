import React from 'react'
import { Stack, Box, Text, Group, Code, Badge } from '@mantine/core'
import { Globe, Shield, UserCheck, LockKeyhole, Key, Link } from 'lucide-react'
import { SectionLabel } from './shared/SectionLabel'

type Classification = 'public' | 'private' | 'pii' | 'secret'

const CLASSIFICATION_COLOR: Record<Classification, string> = {
  public: 'teal',
  private: 'orange',
  pii: 'violet',
  secret: 'red',
}

const CLASSIFICATION_ICON: Record<Classification, React.ReactNode> = {
  public: <Globe size={12} />,
  private: <Shield size={12} />,
  pii: <UserCheck size={12} />,
  secret: <LockKeyhole size={12} />,
}

type DbColumnPanelProps = {
  metadata?: {
    tableName?: string
    columnName?: string
    type?: string
    nullable?: boolean
    isPrimaryKey?: boolean
    foreignKey?: { table: string; column: string }
    enumType?: string
    classification?: Classification
    description?: string
  }
}

export const DbColumnPanel: React.FC<DbColumnPanelProps> = ({ metadata = {} }) => {
  const {
    tableName,
    columnName,
    type,
    nullable,
    isPrimaryKey,
    foreignKey,
    enumType,
    classification,
    description,
  } = metadata

  const cls = classification ?? 'private'

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs" align="center">
          {isPrimaryKey && <Key size={16} />}
          <Text size="lg" ff="monospace" fw={600}>
            {columnName}
          </Text>
        </Group>
        {tableName && (
          <Text size="sm" c="dimmed" mt={2}>
            {tableName}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <Badge
          color={CLASSIFICATION_COLOR[cls]}
          variant="light"
          leftSection={CLASSIFICATION_ICON[cls]}
        >
          {cls}
        </Badge>
        {isPrimaryKey && (
          <Badge color="blue" variant="light" leftSection={<Key size={10} />}>
            Primary Key
          </Badge>
        )}
        {nullable === false && (
          <Badge color="gray" variant="light">
            NOT NULL
          </Badge>
        )}
      </Group>

      {description && (
        <Box>
          <SectionLabel>Description</SectionLabel>
          <Text size="sm">{description}</Text>
        </Box>
      )}

      <Box>
        <SectionLabel>SQL Type</SectionLabel>
        <Code>{enumType ?? type ?? '—'}</Code>
      </Box>

      {foreignKey && (
        <Box>
          <SectionLabel>Foreign Key</SectionLabel>
          <Group gap={4}>
            <Link size={12} />
            <Code>
              {foreignKey.table}.{foreignKey.column}
            </Code>
          </Group>
        </Box>
      )}
    </Stack>
  )
}
