import type { CSSProperties, ReactNode } from 'react'
import clsx from 'clsx'
import classes from './PikkuSwitch.module.css'

type SwitchTone = 'default' | 'green' | 'red' | 'yellow' | 'blue'

export interface PikkuSwitchOption<T extends string> {
  value: T
  label: string
  icon: ReactNode
  tone?: SwitchTone
  'data-testid'?: string
}

const TONE_VARS: Record<SwitchTone, CSSProperties> = {
  default: {
    ['--switch-active-bg' as string]: 'var(--mantine-color-primary-light)',
    ['--switch-active-fg' as string]: 'var(--mantine-color-primary-light-color)',
    ['--switch-active-border' as string]: 'transparent',
  },
  green: {
    ['--switch-active-bg' as string]: 'var(--app-surface-success)',
    ['--switch-active-fg' as string]: 'var(--app-green)',
    ['--switch-active-border' as string]: 'var(--app-green-border)',
  },
  red: {
    ['--switch-active-bg' as string]: 'var(--app-surface-danger-soft)',
    ['--switch-active-fg' as string]: 'var(--app-red)',
    ['--switch-active-border' as string]: 'var(--app-red-border)',
  },
  yellow: {
    ['--switch-active-bg' as string]: 'var(--app-surface-warning)',
    ['--switch-active-fg' as string]: 'var(--app-amber)',
    ['--switch-active-border' as string]: 'var(--app-amber-border)',
  },
  blue: {
    ['--switch-active-bg' as string]: 'var(--app-surface-info)',
    ['--switch-active-fg' as string]: 'var(--app-blue)',
    ['--switch-active-border' as string]: 'var(--app-blue-border)',
  },
}

interface PikkuSwitchProps<T extends string> {
  ariaLabel: string
  value: T
  onChange: (value: T) => void
  options: Array<PikkuSwitchOption<T>>
  showAllLabels?: boolean
}

export function PikkuSwitch<T extends string>({
  ariaLabel,
  value,
  onChange,
  options,
  showAllLabels = false,
}: PikkuSwitchProps<T>) {
  return (
    <div
      className={clsx(classes.root, showAllLabels && classes.showAllLabels)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={clsx(classes.item, active && classes.itemActive)}
            style={active ? TONE_VARS[option.tone ?? 'default'] : undefined}
            onClick={() => onChange(option.value)}
            aria-label={option.label}
            title={option.label}
            data-testid={option['data-testid']}
          >
            <span className={classes.icon}>{option.icon}</span>
            <span className={classes.label}>
              <span className={classes.labelInner}>{option.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
