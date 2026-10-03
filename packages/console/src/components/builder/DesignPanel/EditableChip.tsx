import { useEffect, useState } from 'react'
import { TextInput } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'

// ─── Editable text field ─────────────────────────────────────────────────────

export function EditableChip({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = () => {
    const t = draft.trim()
    if (t !== value) onChange(t)
  }

  return (
    <TextInput
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(value)
      }}
      placeholder={m.design_panel_empty_value_placeholder()}
      size="xs"
      styles={{
        input: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 },
      }}
    />
  )
}
