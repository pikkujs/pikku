import React from 'react'
import { Button, Tooltip } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

interface PikkuToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  tooltip?: I18nNode
}

export const PikkuToggle: React.FC<PikkuToggleProps> = ({
  checked,
  onChange,
  tooltip,
}) => {
  useLocale()
  const label = tooltip ?? m.common_show_pikku_internals()
  return (
    <Tooltip label={label} withArrow>
      <Button
        variant={checked ? 'light' : 'default'}
        color={checked ? 'blue' : 'gray'}
        size="xs"
        px="xs"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <img
          src="/pikku-console-logo.png"
          alt="Pikku"
          style={{
            width: 14,
            height: 14,
            objectFit: 'contain',
            opacity: checked ? 1 : 0.5,
          }}
        />
      </Button>
    </Tooltip>
  )
}
