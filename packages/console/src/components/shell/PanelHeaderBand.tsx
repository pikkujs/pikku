import type { ReactNode } from 'react'
import { ActionIcon, Box, Text, Tooltip } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { PanelLeftClose } from 'lucide-react'
import { usePhone } from '../../lib/breakpoints'

/**
 * The header band of a side panel card.
 *
 * Every header row on screen — the page card's ShellHeader bar, the nav head and
 * this — sits at `--screen-header-height` so they share one baseline across the
 * seam between cards. Screens that rebuild this band by hand are how that
 * baseline drifts: one of them only has to forget the fixed height.
 *
 * The collapse control is dropped on a phone because the panel is in the bottom
 * sheet there and the tab bar owns opening and closing it — a second dismiss
 * inside the sheet would put it away without un-pressing its own tab.
 */
export function PanelHeaderBand({
  icon,
  label,
  collapseLabel,
  onCollapse,
  actions,
  testId,
}: {
  icon: ReactNode
  label: I18nString
  /** Tooltip and aria-label for the collapse control. Omit along with
   *  `onCollapse` for a panel that cannot be collapsed. */
  collapseLabel?: I18nString
  onCollapse?: () => void
  /** Extra controls, placed before the collapse button. */
  actions?: ReactNode
  testId?: string
}) {
  const phone = usePhone()
  return (
    <Box
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        height: 'var(--screen-header-height)',
        background: 'var(--app-panel-bg-raised)',
        borderBottom: '1px solid var(--app-border)',
        flexShrink: 0,
      }}
    >
      {icon}
      <Text
        component="span"
        style={{ flex: 1 }}
        fz={12.5}
        fw={600}
        c="var(--app-text)"
      >
        {label}
      </Text>
      {actions}
      {phone || !onCollapse || !collapseLabel ? null : (
        <Tooltip label={collapseLabel} position="bottom-end">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            radius="md"
            aria-label={collapseLabel}
            onClick={onCollapse}
            data-testid={testId}
          >
            <PanelLeftClose size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </Box>
  )
}
