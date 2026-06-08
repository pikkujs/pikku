import type { ComponentProps, ReactNode } from 'react'
import { ActionIcon, Box, Container, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { ExternalLink } from 'lucide-react'
import DocLink from '../ui/DocLink'
import { usePageGate } from '../../context/PageGateContext'

interface ListPageHeaderProps {
  title: ReactNode
  description?: ReactNode
  docsHref?: string
  lead?: ReactNode
  filters?: ReactNode
  view?: ReactNode
}

export function ListPageHeader({ title, description, docsHref, lead, filters, view }: ListPageHeaderProps) {
  const docsButton = docsHref ? <DocLink href={docsHref} /> : null

  const titleStack = (
    <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
      <Text fw={600} size="xl" c="var(--app-text)" truncate style={{ minWidth: 0 }}>
        {title}
      </Text>
      {description != null &&
        (typeof description === 'string' ? (
          <Text size="md" c="dimmed">
            {description}
          </Text>
        ) : (
          <Text size="md" c="dimmed" component="div">
            {description}
          </Text>
        ))}
    </Stack>
  )

  return (
    <>
      {/* Wide: single row — title | filters | view | lead | docs */}
      <Group justify="space-between" align="center" wrap="nowrap" gap="md" visibleFrom="lg">
        {titleStack}
        {filters && <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>{filters}</Group>}
        {view && <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>{view}</Group>}
        {lead && <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>{lead}</Group>}
        {docsButton}
      </Group>

      {/* Narrow: [title | lead | docs] then [filters | view] */}
      <Stack gap="xs" hiddenFrom="lg">
        <Group justify="space-between" align="center" wrap="nowrap" gap="md">
          {titleStack}
          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            {lead}
            {docsButton}
          </Group>
        </Group>
        {(filters || view) && (
          <PageActionBar filters={filters} view={view} />
        )}
      </Stack>
    </>
  )
}

interface PageContainerProps extends ComponentProps<typeof Container> {
  fullWidth?: boolean
  noPadding?: boolean
  header?: ReactNode
  contentGap?: ComponentProps<typeof Stack>['gap']
  emptyState?: ReactNode
  loading?: ReactNode
}

export function PageContainer({
  children,
  style,
  fullWidth = false,
  noPadding = false,
  header,
  contentGap,
  emptyState,
  loading,
  ...props
}: PageContainerProps) {
  const gate = usePageGate()
  const body = loading ?? emptyState ?? gate ?? children

  const content = header ? (
    <Stack gap={contentGap ?? 'md'} style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
      {header}
      {body}
    </Stack>
  ) : (
    body
  )

  return (
    <Container
      size={fullWidth ? undefined : 'lg'}
      fluid={fullWidth}
      py={noPadding ? 0 : 'xl'}
      px={noPadding ? 0 : 'xl'}
      {...props}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        ...style,
      }}
    >
      {content}
    </Container>
  )
}

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  docsHref?: string
}

export function PageHeader({ title, subtitle, actions, docsHref }: PageHeaderProps) {
  return (
    <Stack gap={4} style={{ marginBottom: 'var(--mantine-spacing-xl)' }}>
      <Group justify="space-between" align="center" wrap="nowrap" gap="md">
        <Title order={2} c="var(--app-text)" lh={1.1}>
          {title}
        </Title>
        <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
          {actions && <PageHeaderControls>{actions}</PageHeaderControls>}
          {docsHref && (
            <Tooltip label="Docs">
              <ActionIcon
                component="a"
                href={docsHref}
                target="_blank"
                rel="noopener noreferrer"
                variant="subtle"
                color="gray"
                size="sm"
              >
                <ExternalLink size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
      {subtitle &&
        (typeof subtitle === 'string' ? (
          <Text size="sm" c="dimmed">
            {subtitle}
          </Text>
        ) : (
          <Stack gap={2}>{subtitle}</Stack>
        ))}
    </Stack>
  )
}

interface PageHeaderControlsProps {
  children: ReactNode
}

export function PageHeaderControls({ children }: PageHeaderControlsProps) {
  return (
    <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0, minWidth: 0 }}>
      {children}
    </Group>
  )
}

interface PageToolbarProps {
  children: ReactNode
}

export function PageToolbar({ children }: PageToolbarProps) {
  return (
    <Group gap="sm" wrap="wrap" align="center" style={{ minWidth: 0 }}>
      {children}
    </Group>
  )
}

interface PageActionBarProps {
  lead?: ReactNode
  view?: ReactNode
  filters?: ReactNode
}

export function PageActionBar({ lead, view, filters }: PageActionBarProps) {
  if (!lead && !view && !filters) return null
  return (
    <Group gap="sm" wrap="nowrap" align="center" style={{ width: '100%', minWidth: 0 }}>
      {lead && (
        <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
          {lead}
        </Group>
      )}
      {filters}
      {view && (
        <Group gap="sm" wrap="nowrap" align="center" style={{ marginLeft: 'auto' }}>
          {view}
        </Group>
      )}
    </Group>
  )
}

interface PageRowProps {
  children: ReactNode
}

export function PageRow({ children }: PageRowProps) {
  return (
    <Group gap="sm" wrap="wrap" align="flex-start" style={{ minWidth: 0 }}>
      {children}
    </Group>
  )
}
