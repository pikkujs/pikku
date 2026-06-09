import React from 'react'
import { Button, Tooltip } from '@mantine/core'

interface PikkuToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  tooltip?: string
}

export const PikkuToggle: React.FC<PikkuToggleProps> = ({
  checked,
  onChange,
  tooltip = 'Show Pikku internals',
}) => {
  return (
    <Tooltip label={tooltip} withArrow>
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
