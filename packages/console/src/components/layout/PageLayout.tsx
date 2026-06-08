import type { ComponentProps, ReactNode } from 'react'
import { ActionIcon, Box, Container, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { ExternalLink } from 'lucide-react'
import { usePageGate } from '../../context/PageGateContext'

interface ListPageHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  docsHref?: string
}

export function ListPageHeader({ title, description, actions, docsHref }: ListPageHeaderProps) {
  // One canonical page header for OSS + fabric: title row, then subtitle, then a
  // dedicated full-width actions row. The title sits alone on its row so it can
  // never be squished by heavy actions (filters, multiple buttons); the actions
  // row wraps instead of overflowing. Do not put actions inline with the title.
  return (
    <Stack gap="sm">
      <Stack gap={2}>
        <Group justify="space-between" align="center" wrap="nowrap" gap="md">
          {/* Pin the title color so it never inherits a wrapper's `color` (fabric
              CardListShell sets one, OSS layouts don't) — same on every page. */}
          <Text fw={600} size="md" c="var(--app-text)" truncate style={{ minWidth: 0 }}>
            {title}
          </Text>
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
                style={{ flexShrink: 0 }}
              >
                <ExternalLink size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
        {description != null &&
          (typeof description === 'string' ? (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          ) : (
            description
          ))}
      </Stack>
      {actions && (
        <Group gap="xs" wrap="wrap" align="center" style={{ minWidth: 0 }}>
          {actions}
        </Group>
      )}
    </Stack>
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
    <Group gap="sm" wrap="nowrap" align="center" justify="space-between" h={45} style={{ width: '100%', minWidth: 0 }}>
      <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: 0, flex: 1, flexDirection: 'row' }}>
        {lead}
        <Group gap="sm" style={{ flex: 1, flexDirection: 'row', display: 'flex', justifyContent: 'flex-end' }}>
          {filters}
          {view}
        </Group>
      </Group>
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
