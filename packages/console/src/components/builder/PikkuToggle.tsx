import { memo, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type PikkuToggleItem<T extends string> = {
  value: T
  label: string
  /** Shown instead of label when this item is active. */
  activeLabel?: string
  icon?: ReactNode
  suffix?: ReactNode
  onSuffixClick?: (e: React.MouseEvent) => void
  disabled?: boolean
  /** Hover text. Also what a disabled item says for itself — a door that cannot be
   *  used has to give its reason somewhere. */
  title?: string
  /** A door rather than a view: carries the accent even when it is not the one open. */
  strong?: boolean
  /** Hairline after this item, separating one group of items from the next. */
  dividerAfter?: boolean
  'data-testid'?: string
}

type PikkuToggleProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  items: PikkuToggleItem<T>[]
  compact?: boolean
  /** Header-sized variant: shorter, tighter, smaller type. */
  small?: boolean
}

export const PikkuToggle = memo(function PikkuToggle<T extends string>({
  value,
  onChange,
  items,
  compact,
  small,
}: PikkuToggleProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)
  const [ready, setReady] = useState(false)
  const strongActive = items.some((item) => item.value === value && item.strong)

  useLayoutEffect(() => {
    const btn = itemRefs.current.get(value)
    const container = containerRef.current
    // The selection can belong to a DIFFERENT strip — two of these can sit side by side
    // over one value — and a strip that does not hold it shows no indicator at all
    // rather than leaving one parked where the last selection was.
    if (!container) return
    if (!btn) {
      setIndicator(null)
      return
    }
    const cr = container.getBoundingClientRect()
    const br = btn.getBoundingClientRect()
    const left = br.left - cr.left - 2
    const width = br.width
    // Callers often pass `items` as an inline array (new ref every render), so this
    // layout effect re-runs constantly. Setting a fresh {left,width} object each time
    // would re-render → new items ref → effect → setState … an infinite loop
    // (Maximum update depth exceeded). Only update when the measurement actually
    // changed so an unchanged position bails out and breaks the cycle.
    setIndicator((prev) =>
      prev && prev.left === left && prev.width === width ? prev : { left, width },
    )
    setReady(true)
  }, [value, items])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignSelf: small ? 'center' : 'flex-start',
        alignItems: 'center',
        height: small ? 24 : 32,
        padding: 2,
        gap: 2,
        borderRadius: small ? 7 : 9,
        background: 'var(--app-panel-bg-strong)',
        border: '0.5px solid var(--app-border)',
      }}
    >
      {/* Sliding indicator */}
      {indicator && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 2,
            left: indicator.left,
            width: indicator.width,
            height: 'calc(100% - 4px)',
            background: strongActive
              ? 'color-mix(in srgb, var(--app-accent) 16%, var(--app-panel-bg))'
              : 'var(--app-panel-bg)',
            borderRadius: small ? 5 : 7,
            boxShadow: strongActive
              ? '0 1px 3px rgba(0,0,0,0.10), 0 0 0 1px color-mix(in srgb, var(--app-accent) 55%, transparent)'
              : '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.05)',
            transition: ready ? 'left 160ms ease, width 160ms ease' : 'none',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {items.map((item) => {
        const isActive = item.value === value
        const showLabel = !compact || isActive
        const displayLabel = isActive ? (item.activeLabel ?? item.label) : item.label
        const button = (
          <button
            key={item.value}
            ref={(el) => {
              if (el) itemRefs.current.set(item.value, el)
              else itemRefs.current.delete(item.value)
            }}
            data-testid={item['data-testid']}
            type="button"
            onClick={() => !item.disabled && onChange(item.value)}
            title={item.title ?? (compact && !isActive ? item.label : undefined)}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: showLabel ? 6 : 0,
              height: '100%',
              padding: showLabel ? (small ? '0 8px' : '0 11px') : small ? '0 6px' : '0 9px',
              border: 0,
              borderRadius: small ? 5 : 7,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: small ? 11.5 : 12.5,
              fontWeight: 600,
              background: 'transparent',
              color: isActive
                ? 'var(--app-accent)'
                : item.strong
                  ? 'var(--app-text)'
                  : 'var(--app-text-faint)',
              opacity: item.disabled ? 0.4 : 1,
              transition: 'color 160ms ease',
              whiteSpace: 'nowrap',
            }}
          >
            {item.icon}
            {showLabel && <span>{displayLabel}</span>}
            {item.suffix && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  item.onSuffixClick?.(e)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    item.onSuffixClick?.(e as unknown as React.MouseEvent)
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  marginLeft: 1,
                  marginRight: -3,
                  borderRadius: 5,
                  cursor: 'pointer',
                }}
              >
                {item.suffix}
              </span>
            )}
          </button>
        )
        if (!item.dividerAfter) return button
        return (
          <span key={item.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {button}
            <span
              aria-hidden
              style={{
                width: 1,
                height: '58%',
                margin: '0 4px',
                borderRadius: 1,
                background: 'var(--app-border)',
              }}
            />
          </span>
        )
      })}
    </div>
  )
}) as <T extends string>(props: PikkuToggleProps<T>) => React.ReactElement
