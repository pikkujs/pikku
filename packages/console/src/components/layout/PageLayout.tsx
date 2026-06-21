import type { ComponentProps, ReactNode } from 'react'
import { ActionIcon, Box, Container, Group, Stack, Text, Title, Tooltip } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { ExternalLink } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import DocLink from '../ui/DocLink'
import { ShellHeader, type ShellHeaderSearch, type ShellHeaderSelection } from '../ui/ShellHeader'
import { usePageGate } from '../../context/PageGateContext'

interface ListPageHeaderProps<T extends string = string> {
  title: I18nNode
  description?: I18nNode
  docsHref?: string
  lead?: ReactNode
  filters?: ReactNode
  view?: ReactNode
  // Structured controls participate in ShellHeader's measured collapse: the
  // selection folds switch → cycle → drawer, and search folds into the drawer.
  // Prefer these over the raw `filters`/`view` nodes (which ride the
  // non-collapsing `actionsNode` escape hatch and overflow when narrow).
  search?: ShellHeaderSearch
  selection?: ShellHeaderSelection<T>
}

// Renders the shared ShellHeader bar: title (first to collapse) + description as
// the count, with the page's existing filters/view/lead/docs controls passed
// through on the right.
export function ListPageHeader<T extends string = string>({
  title,
  description,
  docsHref,
  lead,
  filters,
  view,
  search,
  selection,
}: ListPageHeaderProps<T>) {
  const docsButton = docsHref ? <DocLink href={docsHref} /> : null
  const right =
    filters || view || lead || docsButton ? (
      <>
        {filters}
        {view}
        {lead}
        {docsButton}
      </>
    ) : undefined
  return (
    <ShellHeader title={title} count={description} search={search} selection={selection} actionsNode={right} />
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

  // When a header is present it renders as a full-bleed bar above the body, and
  // the body runs full-width so both share one gutter (the ShellHeader pattern).
  const hasHeader = header != null
  const bodyContainer = (
    <Container
      size={hasHeader || fullWidth ? undefined : 'lg'}
      fluid={hasHeader || fullWidth}
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
      {body}
    </Container>
  )

  if (!hasHeader) return bodyContainer

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
      {header}
      {bodyContainer}
    </div>
  )
}

interface PageHeaderProps {
  title: I18nNode
  subtitle?: I18nNode
  actions?: ReactNode
  docsHref?: string
}

export function PageHeader({ title, subtitle, actions, docsHref }: PageHeaderProps) {
  useLocale()
  return (
    <Stack gap={4} style={{ marginBottom: 'var(--mantine-spacing-xl)' }}>
      <Group justify="space-between" align="center" wrap="nowrap" gap="md">
        <Title order={2} c="var(--app-text)" lh={1.1}>
          {title}
        </Title>
        <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
          {actions && <PageHeaderControls>{actions}</PageHeaderControls>}
          {docsHref && (
            <Tooltip label={m.common_docs_link()}>
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
      {lead ? (
        <Group gap="sm" wrap="nowrap" align="center" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {filters}
          {view}
        </Group>
      ) : (
        <>
          {filters}
          {view && (
            <Group gap="sm" wrap="nowrap" align="center" style={{ marginLeft: 'auto' }}>
              {view}
            </Group>
          )}
        </>
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
