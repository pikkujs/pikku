import { Drawer, rem } from '@pikku/mantine/core'
import type { ReactNode } from 'react'
import { TAB_BAR_FOOT } from './mobileLayout'

/**
 * The bottom sheet every foot-bar tab opens, seated above the bar so the bar stays
 * tappable and a re-tap closes it.
 *
 * The `inner` and `overlay` styles are load-bearing: Mantine stretches the drawer
 * viewport across the cross axis, so `size="auto"` alone still renders a full-height
 * sheet. Both lines are required; neither works on its own.
 *
 * @param fill - Fill the space above the bar, for a surface you work in rather than
 * pick from.
 * @param keepMounted - Keep content mounted while shut, so anything portalling into
 * the sheet has a target before the first open.
 */
export function MobileSheet({
  opened,
  onClose,
  children,
  fill,
  keepMounted,
}: {
  opened: boolean
  onClose: () => void
  children: ReactNode
  fill?: boolean
  keepMounted?: boolean
}) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size={fill ? '100%' : 'auto'}
      keepMounted={keepMounted}
      withCloseButton={false}
      padding={0}
      overlayProps={{ backgroundOpacity: 0.55, blur: 2 }}
      styles={{
        inner: { bottom: TAB_BAR_FOOT, alignItems: 'flex-end' },
        overlay: { bottom: TAB_BAR_FOOT },
        content: {
          borderTopLeftRadius: 'var(--mantine-radius-lg)',
          borderTopRightRadius: 'var(--mantine-radius-lg)',
          height: fill ? '100%' : 'auto',
          maxHeight: `calc(100vh - ${TAB_BAR_FOOT} - ${rem(fill ? 24 : 64)})`,
          display: 'flex',
          flexDirection: 'column',
        },
        body: {
          flex: 1,
          minHeight: 0,
          padding: fill ? 0 : `0 0 ${rem(8)}`,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        },
      }}
    >
      {children}
    </Drawer>
  )
}
