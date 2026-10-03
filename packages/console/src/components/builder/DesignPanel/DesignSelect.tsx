import { Select } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'

// ─── Select (for large option sets like variant) ─────────────────────────────

export function DesignSelect({
  strVal,
  options,
  propName,
  unset,
  onChange,
}: {
  strVal: string
  options: readonly string[]
  propName: string
  unset: boolean
  onChange: (name: string, value: string | number | boolean | null) => void
}) {
  return (
    <Select
      value={unset ? null : strVal}
      onChange={(v) => onChange(propName, v ?? null)}
      data={options as string[]}
      placeholder={m.design_panel_variant_unset()}
      clearable
      size="xs"
    />
  )
}
