import { useCallback, useMemo } from 'react'
import { PikkuToggle } from '../PikkuToggle'
import { TOKEN_SCALE_LABELS } from './internal.js'

// ─── Toggle wrapper ──────────────────────────────────────────────────────────

export function DesignToggle({
  strVal,
  options,
  isTokenScale,
  propName,
  onChange,
}: {
  strVal: string
  options: readonly string[]
  isTokenScale?: boolean
  propName: string
  onChange: (name: string, value: string | number | boolean | null) => void
}) {
  const items = useMemo(
    () =>
      options.map((o) => ({
        value: o,
        label: o,
        activeLabel: isTokenScale ? (TOKEN_SCALE_LABELS[o] ?? o) : undefined,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, isTokenScale],
  )
  const handleChange = useCallback(
    (v: string) => {
      if (v === strVal) return
      if (v === 'true') onChange(propName, true)
      else if (v === 'false') onChange(propName, false)
      else onChange(propName, v)
    },
    [strVal, propName, onChange],
  )
  return <PikkuToggle value={strVal} onChange={handleChange} items={items} />
}
