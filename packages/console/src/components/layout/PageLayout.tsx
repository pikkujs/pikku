import type { ComponentProps, ReactNode } from 'react'
import { Box, Container, Group } from '@pikku/mantine/core'
import type { Stack } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { useLocale } from '@/i18n/config'
import DocLink from '../ui/DocLink'
import {
  ShellHeader,
  type ShellHeaderAction,
  type ShellHeaderFilter,
  type ShellHeaderSearch,
  type ShellHeaderSelection,
} from '../ui/ShellHeader'
import { usePageGate } from '../../context/PageGateContext'
import { useConsoleChrome } from '../../context/ConsoleChromeContext'
import { usePhone } from '../../lib/breakpoints'
import styles from '../shell/PageCard.module.css'

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
    <ShellHeader
      title={title}
      count={description}
      search={search}
      selection={selection}
      actionsNode={right}
    />
  )
}

interface PageContainerProps extends ComponentProps<typeof Container> {
  fullWidth?: boolean
  noPadding?: boolean
  header?: ReactNode
  contentGap?: ComponentProps<typeof Stack>['gap']
  emptyState?: ReactNode
  loading?: ReactNode
  /** An extra band between the header and the body, inside the same card. */
  extraBand?: ReactNode
}

/**
 * The general page shape: a page is ONE floating card on the app canvas — the
 * ShellHeader bar as a top band, the page body below it in the same card — so
 * navigating only swaps what is inside the card and the console reads as one
 * fluid screen rather than a sequence of page loads.
 *
 * Under `host` chrome the card is NOT drawn: the host has already put the screen
 * in its own page card, and a second one would read as a card in a card. See
 * ConsoleChromeContext.
 */
export function PageContainer({
  children,
  style,
  fullWidth = false,
  noPadding = false,
  header,
  contentGap,
  emptyState,
  loading,
  extraBand,
  ...props
}: PageContainerProps) {
  const gate = usePageGate()
  const body = loading ?? emptyState ?? gate ?? children
  const hosted = useConsoleChrome() === 'host'
  // The `xl` body gutter is a DESKTOP page gutter. On a phone, where this card is
  // the whole screen, 32px a side spends 64px of a 390px viewport on nothing;
  // `md` keeps the text off the screen edge without reading as an inset panel.
  // Declared before `props` so a page can still override it. `noPadding` has to
  // keep winning: it is a flag read below, so px/py set here would silently
  // re-pad a page that asked for a bare body.
  const phone = usePhone()
  const gutter =
    phone && !noPadding ? { px: 'md' as const, py: 'md' as const } : {}

  // When a header is present it renders as a full-bleed bar above the body, and
  // the body runs full-width so both share one gutter (the ShellHeader pattern).
  const hasHeader = header != null
  const cards = hasHeader && !hosted
  const bodyContainer = (
    <Container
      size={hasHeader || fullWidth || cards ? undefined : 'lg'}
      fluid={hasHeader || fullWidth || cards}
      // The theme gives every Container `px: 'xl'` as a default prop, and a
      // default prop becomes an INLINE padding-inline that beats the `padding`
      // below — so the inline gutter was 36px whatever the chrome said, and a
      // 450px side panel spent 72px of itself on empty margin. Say it on the
      // same prop the theme does, from the same token the block axis uses.
      px={noPadding ? 0 : 'var(--console-body-gutter)'}
      {...gutter}
      {...props}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        // Same gutter the other layouts read, so a page shell and a list screen
        // are inset alike in whichever chrome they land in.
        padding: noPadding ? 0 : 'var(--console-body-gutter)',
        ...style,
      }}
    >
      {body}
    </Container>
  )

  if (!hasHeader) return bodyContainer

  // Hosted: the card is the shell's, but the bands inside it are still this
  // page's. They are the same bands the self-drawn card below uses — the
  // hairline under a page header is the one every panel header already draws,
  // and a page that loses it in one chrome and keeps it in the other reads as
  // two different products.
  if (!cards)
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div className={styles.headerBand}>{header}</div>
        {extraBand ? <div className={styles.extraBand}>{extraBand}</div> : null}
        {bodyContainer}
      </div>
    )

  return (
    <div className={styles.pageStack}>
      <div className={styles.card}>
        <div className={styles.headerBand}>{header}</div>
        {extraBand ? <div className={styles.extraBand}>{extraBand}</div> : null}
        <div className={styles.body}>{bodyContainer}</div>
      </div>
    </div>
  )
}

/**
 * The same floating card WITHOUT a header band — for a screen that already ships
 * its own `ListPageHeader` bar as its first child. Wrapping it here gives it the
 * identical single-card silhouette every other page has, instead of a bare bar
 * and body floating on the app canvas.
 */
export function PanelCard({
  children,
  maxWidth,
  testId,
}: {
  children: ReactNode
  /** Cap the card and centre it on the canvas — for a screen whose content is a
   *  single reading column, where a card stretched across a wide monitor would
   *  run the content edge to edge. */
  maxWidth?: number | string
  testId?: string
}) {
  return (
    <div
      className={styles.pageStack}
      style={maxWidth ? { alignItems: 'center' } : undefined}
      data-testid={testId}
    >
      <div
        className={styles.card}
        style={maxWidth ? { width: '100%', maxWidth } : undefined}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * The page card a STAND-IN state renders into — a loader, an empty state, a
 * not-found. These are early returns that replace the whole route body, so
 * without this they float bare on the app canvas while every real page beside
 * them is a card with a header band, and the screen reads as two different apps
 * mid-wait. The state's own component stays bare; this is the one card.
 */
export function StatePage({
  title,
  actions,
  noHeader,
  children,
}: {
  /** Omit for a pure WAITING state — an untitled state drops the band the same
   *  way `noHeader` does. A boot gate that titles its loader makes the band churn
   *  through placeholder text before the real page title lands; the bare card
   *  keeps the silhouette steady. */
  title?: I18nNode
  /** Controls for the header band's right side — a state that owns the viewport
   *  puts its way-out here rather than floating a button. */
  actions?: ReactNode
  /** Drop the header band entirely — for a state whose own content already names
   *  the thing, where the band only repeats it in a second place. */
  noHeader?: boolean
  children: ReactNode
}) {
  if (noHeader || (!title && !actions))
    return (
      <PanelCard>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
          {children}
        </div>
      </PanelCard>
    )
  return (
    <PageContainer
      noPadding
      fullWidth
      style={{ display: 'flex', flexDirection: 'column' }}
      header={<PageHeader title={title} actions={actions} />}
    >
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
        {children}
      </div>
    </PageContainer>
  )
}

/**
 * The same state card for a state that returns ABOVE the shell — a provider gate
 * whose early return replaces the whole app, so there is no layout left to supply
 * the viewport box the card fills. Everything inside the shell uses
 * {@link StatePage} directly; this is only for the gates outside it.
 */
export function ViewportStatePage({
  title,
  children,
}: {
  title?: I18nNode
  children: ReactNode
}) {
  return (
    <Box style={{ height: '100vh', display: 'flex' }}>
      <StatePage title={title}>{children}</StatePage>
    </Box>
  )
}

interface PageHeaderProps<S extends string = string> {
  title?: I18nNode
  subtitle?: I18nNode
  /** Put the subtitle inline to the RIGHT of the title (one row) instead of the
   *  default stacked-below layout. For a short count or badge — NOT for a long
   *  description, which should stay stacked so it can wrap. */
  countInline?: boolean
  /** Raw JSX escape hatch for the right side; rendered after structured actions. */
  actions?: ReactNode
  /** Controls centred in the bar, independent of title/actions. */
  centerNode?: ReactNode
  docsHref?: string
  /** Structured ShellHeader controls — these collapse responsively (switch →
   *  cycle → drawer for selection; labels → icons → menu for actions) so the bar
   *  never overflows. Prefer these over raw `actions` JSX. */
  selection?: ShellHeaderSelection<S>
  search?: ShellHeaderSearch
  filters?: ShellHeaderFilter[]
  headerActions?: ShellHeaderAction[]
  /** Side-panel variant: tightens the bar's horizontal gutter to the panel body's
   *  so the title and close X sit over the content, not the page gutter. */
  panel?: boolean
}

/**
 * The page header band — the same compact ShellHeader bar every screen uses, so
 * one page header exists rather than one per feature. Title (first to collapse)
 * plus the subtitle as the count, with the page's controls on the right.
 */
export function PageHeader<S extends string = string>({
  title,
  subtitle,
  countInline,
  actions,
  centerNode,
  docsHref,
  selection,
  search,
  filters,
  headerActions,
  panel,
}: PageHeaderProps<S>) {
  useLocale()
  const right =
    actions || docsHref ? (
      <>
        {actions}
        {docsHref && <DocLink href={docsHref} />}
      </>
    ) : undefined
  // Inline mode: fold the subtitle into the title row (title + count on one line)
  // so ShellHeader's stacked title/count slot renders a single row.
  const inline = countInline && subtitle != null
  const bar = (
    <ShellHeader
      title={
        inline ? (
          <Group gap={10} align="center" wrap="nowrap" style={{ minWidth: 0 }}>
            {title}
            {subtitle}
          </Group>
        ) : (
          title
        )
      }
      count={inline ? undefined : subtitle}
      selection={selection}
      search={search}
      filters={filters}
      actions={headerActions}
      actionsNode={right}
    />
  )
  if (panel) return <div className={styles.panelHeader}>{bar}</div>
  if (!centerNode) return bar
  // Overlay the centred controls on the shared bar: the bar keeps title (left)
  // and actions (right); the centred region floats in the gap between them.
  // pointer-events are gated so the overlay only captures clicks on its controls.
  return (
    <div style={{ position: 'relative' }}>
      {bar}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            pointerEvents: 'auto',
          }}
        >
          {centerNode}
        </div>
      </div>
    </div>
  )
}

interface PageHeaderControlsProps {
  children: ReactNode
}

export function PageHeaderControls({ children }: PageHeaderControlsProps) {
  return (
    <Group
      gap="xs"
      wrap="nowrap"
      align="center"
      style={{ flexShrink: 0, minWidth: 0 }}
    >
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
    <Group
      gap="sm"
      wrap="nowrap"
      align="center"
      style={{ width: '100%', minWidth: 0 }}
    >
      {lead && (
        <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
          {lead}
        </Group>
      )}
      {lead ? (
        <Group
          gap="sm"
          wrap="nowrap"
          align="center"
          style={{ marginLeft: 'auto', flexShrink: 0 }}
        >
          {filters}
          {view}
        </Group>
      ) : (
        <>
          {filters}
          {view && (
            <Group
              gap="sm"
              wrap="nowrap"
              align="center"
              style={{ marginLeft: 'auto' }}
            >
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
