import type { CSSProperties, ReactNode } from 'react'
import { ActionIcon } from '@pikku/mantine/core'
import { X } from 'lucide-react'
import type { I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { PageContainer, PageHeader } from '../layout/PageLayout'
import { EdgePanel } from './EdgePanel'

/**
 * The console has NO drawers. A secondary surface — a detail view, an edit form,
 * a log stream — opens as a side PANEL: its own full-height card pinned to the
 * end edge of the content area, with the page card shrinking to make room (see
 * EdgePanel) instead of being covered by a scrim. The panel wears the same
 * chrome as a page (PageContainer card + PageHeader band), so the two header
 * hairlines line up and the screen still reads as one card language.
 */

/** The drawer size names call sites used, as panel widths. */
const NAMED_WIDTHS = { sm: 380, md: 440, lg: 620, xl: 780 } as const

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
  const px = typeof width === 'number' ? width : NAMED_WIDTHS[width]

  return (
    <EdgePanel
      opened={opened}
      side="end"
      width={px}
      // A non-modal dialog: it is a distinct surface the user opened and closes,
      // but the page beside it stays live — hence no aria-modal, no scrim.
      role="dialog"
      testId={testId}
    >
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
    </EdgePanel>
  )
}
