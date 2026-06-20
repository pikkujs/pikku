import React from 'react'
import { Button } from '@pikku/mantine/core'
import { useI18n } from '@pikku/react/i18n'
import { CONTROL_H, type ShellHeaderSelection } from './shellHeaderShared'

type CycleSwitchProps<T extends string> = {
  selection: ShellHeaderSelection<T>
}

export const CycleSwitch = <T extends string>({
  selection,
}: CycleSwitchProps<T>): React.ReactElement | null => {
  const { t } = useI18n()
  const { options, value, onChange, ariaLabel } = selection
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const cur = options[idx]
  if (!cur) return null
  return (
    <Button
      variant="default"
      size="sm"
      leftSection={cur.icon}
      onClick={() => onChange(options[(idx + 1) % options.length]!.value)}
      aria-label={t('shell_header.cycle_aria', { ariaLabel, label: cur.label })}
      styles={{ root: { flexShrink: 0, height: CONTROL_H, minHeight: CONTROL_H } }}
    >
      {cur.label}
    </Button>
  )
}
