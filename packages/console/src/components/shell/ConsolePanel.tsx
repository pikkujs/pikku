import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ActionIcon } from '@pikku/mantine/core'
import { X } from 'lucide-react'
import type { I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { PageContainer, PageHeader } from '../layout/PageLayout'
import { ConsoleChromeContext } from '../../context/ConsoleChromeContext'
import { usePanelInset } from '../../context/PanelInsetProvider'
import { usePhone } from '../../lib/breakpoints'

/**
 * The console has NO drawers. A secondary surface — a detail view, an edit form,
 * a log stream — opens as a side PANEL: its own full-height card pinned to the
 * end edge of the content area, with the page card shrinking to make room (see
 * PanelInsetProvider) instead of being covered by a scrim. The panel wears the
 * same chrome as a page (PageContainer card + PageHeader band), so the two header
 * hairlines line up and the screen still reads as one card language.
 *
 * On a phone there is no room to sit beside anything, so the panel takes the
 * whole content area and reserves nothing.
 */

/** The drawer size names call sites used, as panel widths. */
const NAMED_WIDTHS = { sm: 380, md: 440, lg: 620, xl: 780 } as const

/** One card gutter, matching --app-card-gutter in shell/card.module.css. */
const CARD_GUTTER = 8

export type ConsolePanelWidth = number | keyof typeof NAMED_WIDTHS

export function ConsolePanel({
  opened,
  onClose,
  title,
  width = 'md',
  footer,
  bodyStyle,
  testId,
  children,
}: {
  opened: boolean
  onClose: () => void
  title?: I18nNode
  width?: ConsolePanelWidth
  /** Optional footer bar — soft bg + top border, end-aligned, pinned below the body. */
  footer?: ReactNode
  /** Override the body wrapper. Defaults to a padded, scrollable block; pass a
   *  flush flex column for full-height content like a log stream. */
  bodyStyle?: CSSProperties
  testId?: string
  children: ReactNode
}) {
  const id = useId()
  const { reserve } = usePanelInset()
  const isMobile = usePhone()
  const px = typeof width === 'number' ? width : NAMED_WIDTHS[width]
  // The panel's card gutter overlaps the page's, so reserve one gutter less.
  useEffect(() => {
    reserve(id, opened && !isMobile ? px - CARD_GUTTER : null)
    return () => reserve(id, null)
  }, [id, opened, px, isMobile, reserve])

  // The portal root is mounted by the layout, so it only exists after the first
  // paint — resolve it in an effect rather than during render.
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setTarget(
      document.querySelector<HTMLElement>('#console-content-portal-root')
    )
  }, [opened])

  if (!opened) return null

  const panel = (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        insetInlineEnd: 0,
        width: isMobile ? '100%' : px,
        maxWidth: '100%',
        display: 'flex',
        // The portal root is pointer-events:none so the page stays clickable
        // around the panel; the panel itself takes its clicks back.
        pointerEvents: 'auto',
        zIndex: 3,
      }}
      // A non-modal dialog: it is a distinct surface the user opened and closes,
      // but the page beside it stays live — hence no aria-modal, no scrim.
      role="dialog"
      data-testid={testId}
    >
      {/* The panel is its OWN card. It portals out of the page but not out of
          React context, so without this it would inherit the screen's `host`
          chrome — where a card is deliberately not drawn because one already
          surrounds it — and render as a flush block on the canvas. */}
      <ConsoleChromeContext.Provider value="self">
        <PageContainer
          noPadding
          fullWidth
          style={{ display: 'flex', flexDirection: 'column' }}
          header={
            <PageHeader
              panel
              title={title}
              actions={
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="input-sm"
                  aria-label={m.common_close()}
                  onClick={onClose}
                  data-testid={testId ? `${testId}-close` : undefined}
                >
                  <X size={16} />
                </ActionIcon>
              }
            />
          }
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              padding: '16px 18px',
              ...bodyStyle,
            }}
          >
            {children}
          </div>
          {footer && (
            <div
              style={{
                flexShrink: 0,
                borderTop: '0.5px solid var(--app-border)',
                padding: '12px 18px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                background: 'var(--app-panel-bg-soft)',
              }}
            >
              {footer}
            </div>
          )}
        </PageContainer>
      </ConsoleChromeContext.Provider>
    </div>
  )

  return target ? createPortal(panel, target) : null
}
