// ─────────────────────────────────────────────────────────────────────────────
// ShellToggle — the segmented switch in the Design sub-header.
//
// Deliberately a pixel match for the console's header toggle (`PikkuToggle` in
// its `small` variant): same 24px height, 2px inset, 7/5px radii, 11.5px type and
// sliding indicator. This shell renders in an iframe directly under the console's
// own 45px header, so a toggle with its own proportions reads as a foreign
// control sitting inside the console rather than part of it. Both sides style against
// the same `--app-*` variables, so only the geometry had to be restated here —
// the design server is a standalone node project and cannot import the console's
// component.
// ─────────────────────────────────────────────────────────────────────────────
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type ShellToggleItem<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
  'data-testid'?: string
}

export function ShellToggle<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T
  onChange: (value: T) => void
  items: ShellToggleItem<T>[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const btn = itemRefs.current.get(value)
    const container = containerRef.current
    if (!btn || !container) return
    const cr = container.getBoundingClientRect()
    const br = btn.getBoundingClientRect()
    const left = br.left - cr.left - 2
    const width = br.width
    // `items` is passed inline (new ref every render), so this effect re-runs
    // constantly; setting a fresh object each time would loop. Bail when the
    // measurement is unchanged. Same guard as the console's PikkuToggle.
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
        alignSelf: 'center',
        alignItems: 'center',
        height: 24,
        padding: 2,
        gap: 2,
        borderRadius: 7,
        background: 'var(--app-panel-bg-strong)',
        border: '0.5px solid var(--app-border)',
      }}
    >
      {indicator && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 2,
            left: indicator.left,
            width: indicator.width,
            height: 'calc(100% - 4px)',
            background: 'var(--app-panel-bg)',
            borderRadius: 5,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.05)',
            transition: ready ? 'left 160ms ease, width 160ms ease' : 'none',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {items.map((item) => {
        const isActive = item.value === value
        return (
          <button
            key={item.value}
            ref={(el) => {
              if (el) itemRefs.current.set(item.value, el)
              else itemRefs.current.delete(item.value)
            }}
            data-testid={item['data-testid']}
            type="button"
            onClick={() => onChange(item.value)}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: '100%',
              padding: '0 8px',
              border: 0,
              borderRadius: 5,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 11.5,
              fontWeight: 600,
              background: 'transparent',
              color: isActive ? 'var(--app-accent)' : 'var(--app-text-faint)',
              transition: 'color 160ms ease',
              whiteSpace: 'nowrap',
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
