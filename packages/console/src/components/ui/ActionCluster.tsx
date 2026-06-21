import React, { type ReactNode } from 'react'
import { ActionIcon, Button, Menu, Tooltip } from '@pikku/mantine/core'
import { MoreHorizontal } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import {
  CONTROL_H,
  type ActMode,
  type ShellHeaderAction,
} from './shellHeaderShared'

function actionButton(a: ShellHeaderAction, mode: ActMode): ReactNode {
  const variant = a.variant === 'primary' ? 'filled' : a.variant === 'subtle' ? 'subtle' : 'default'
  const effectiveMode: ActMode = a.iconOnly && a.icon ? 'icon' : mode
  if (effectiveMode === 'label' || !a.icon) {
    const btn = (
      <Button
        key={a.key}
        variant={variant}
        size="sm"
        leftSection={a.icon}
        onClick={a.onClick}
        disabled={a.disabled}
        styles={{ root: { flexShrink: 0, height: CONTROL_H, minHeight: CONTROL_H } }}
      >
        {a.label}
      </Button>
    )
    return a.tooltip ? (
      <Tooltip key={a.key} label={a.tooltip}>
        {btn}
      </Tooltip>
    ) : (
      btn
    )
  }
  return (
    <Tooltip key={a.key} label={a.tooltip ?? a.label}>
      <ActionIcon variant={variant} size={CONTROL_H} onClick={a.onClick} disabled={a.disabled} aria-label={a.label}>
        {a.icon}
      </ActionIcon>
    </Tooltip>
  )
}

type ActionClusterProps = {
  actions: ShellHeaderAction[]
  mode: ActMode
}

export const ActionCluster: React.FC<ActionClusterProps> = ({ actions, mode }) => {
  useLocale()
  if (mode !== 'compact') {
    return <>{actions.map((a) => actionButton(a, mode))}</>
  }
  // compact: primaries (and icon-only actions) stay as icons, the rest collapse
  // into a kebab menu.
  const primary = actions.filter((a) => a.variant === 'primary' || a.iconOnly)
  const rest = actions.filter((a) => a.variant !== 'primary' && !a.iconOnly)
  return (
    <>
      {primary.map((a) => actionButton(a, 'icon'))}
      {rest.length > 0 && (
        <Menu position="bottom-end" withinPortal shadow="md">
          <Menu.Target>
            <ActionIcon variant="default" size={CONTROL_H} aria-label={m.shell_header_more_actions()}>
              <MoreHorizontal size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {rest.map((a) => (
              <Menu.Item key={a.key} leftSection={a.icon} onClick={a.onClick} disabled={a.disabled}>
                {a.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
    </>
  )
}
