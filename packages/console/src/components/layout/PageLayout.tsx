import type { ComponentProps, ReactNode } from 'react'
import { ActionIcon, Container, Group, Stack, Text, Title, Tooltip } from '@mantine/core'
import { ExternalLink } from 'lucide-react'
import { usePageGate } from '../../context/PageGateContext'

interface ListPageHeaderProps {
  title: string
  description: string
  actions?: ReactNode
}

export function ListPageHeader({ title, description, actions }: ListPageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <Stack gap={2}>
        <Text fw={600} size="md">{title}</Text>
        <Text size="sm" c="dimmed">{description}</Text>
      </Stack>
      {actions && (
        <Group gap="xs" style={{ flexShrink: 0 }}>{actions}</Group>
      )}
    </Group>
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
