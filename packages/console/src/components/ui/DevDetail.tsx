import React from 'react'
import {
  ActionIcon,
  Anchor,
  Box,
  CopyButton,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@pikku/mantine/core'
import { CodeHighlight } from '@mantine/code-highlight'
import './code-highlight-styles'
import { asI18n, type I18nNode } from '@pikku/react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { m } from '@/i18n/messages'
import classes from './DevDetail.module.css'

export const devSourcePath = (file: string, line?: number) => {
  const marker = file.indexOf('/workspace/project/')
  const relative =
    marker >= 0 ? file.slice(marker + '/workspace/project/'.length) : file
  return line ? `${relative}:${line}` : relative
}

export const DevCopy: React.FC<{ value: string }> = ({ value }) => (
  <CopyButton value={value}>
    {({ copied, copy }) => (
      <Tooltip label={copied ? m.common_copied() : m.common_copy()}>
        <ActionIcon
          variant="subtle"
          color={copied ? 'teal' : 'gray'}
          size="sm"
          aria-label={m.common_copy()}
          onClick={copy}
          data-testid="dev-copy"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </ActionIcon>
      </Tooltip>
    )}
  </CopyButton>
)

export const DevFields: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <Box className={classes.fields}>{children}</Box>

export const DevField: React.FC<{
  label: I18nNode
  value?: string
  children?: React.ReactNode
  mono?: boolean
  copy?: boolean
  href?: string
  testId?: string
}> = ({ label, value, children, mono = true, copy = true, href, testId }) => (
  <Box className={classes.field} data-testid={testId}>
    <Text size="sm" c="dimmed">
      {label}
    </Text>
    <Group gap={4} wrap="nowrap" align="center" className={classes.value}>
      <Box miw={0}>
        {children ?? (
          <Text size="sm" ff={mono ? 'monospace' : undefined}>
            {asI18n(value ?? '—')}
          </Text>
        )}
      </Box>
      {href && (
        <ActionIcon
          component="a"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={m.common_docs_link()}
        >
          <ExternalLink size={13} />
        </ActionIcon>
      )}
      {copy && value && <DevCopy value={value} />}
    </Group>
  </Box>
)

export const DevCode: React.FC<{
  code: string
  label?: I18nNode
  language?: string
}> = ({ code, label, language = 'bash' }) => (
  <Stack gap={6}>
    {label && (
      <Text size="sm" c="dimmed">
        {label}
      </Text>
    )}
    <CodeHighlight
      code={code}
      language={language}
      copyLabel={m.common_copy()}
      copiedLabel={m.common_copied()}
      styles={{
        pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
        code: { whiteSpace: 'pre-wrap' },
      }}
    />
  </Stack>
)

export const DevNote: React.FC<{ children: I18nNode }> = ({
  children,
}) => (
  <Text size="sm" c="dimmed" maw={680}>
    {children}
  </Text>
)

export const DevLinks: React.FC<{
  links: { href: string; label: I18nNode }[]
}> = ({ links }) => (
  <Group gap="lg" wrap="wrap">
    {links.map((link) => (
      <Anchor
        key={link.href}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
      >
        <Group gap={4} wrap="nowrap" component="span">
          {link.label}
          <ExternalLink size={12} />
        </Group>
      </Anchor>
    ))}
  </Group>
)

export const DevTable: React.FC<{
  columns: I18nNode[]
  rows: { key: string; cells: React.ReactNode[] }[]
  minWidth?: number
}> = ({ columns, rows, minWidth = 520 }) => (
  <ScrollArea type="auto">
    <Table fz="sm" miw={minWidth} verticalSpacing={6} horizontalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          {columns.map((column, index) => (
            <Table.Th key={index}>
              <Text size="sm" c="dimmed" fw={500}>
                {column}
              </Text>
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row.key}>
            {row.cells.map((cell, index) => (
              <Table.Td key={index}>{cell}</Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  </ScrollArea>
)

export const DevMono: React.FC<{ value: string; copy?: boolean }> = ({
  value,
  copy = false,
}) => (
  <Group gap={4} wrap="nowrap" component="span">
    <Text size="sm" ff="monospace" component="span">
      {asI18n(value)}
    </Text>
    {copy && <DevCopy value={value} />}
  </Group>
)
