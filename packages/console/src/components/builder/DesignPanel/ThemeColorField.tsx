import { useEffect, useState } from 'react'
import { ColorInput } from '@pikku/mantine/core'

// Hex editor for one brand color role: local draft, committed on picker
// change-end / Enter / blur — not per keystroke (each commit writes a file).
export function ThemeColorField({ hex, onCommit }: { hex: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(hex)

  useEffect(() => {
    setDraft(hex)
  }, [hex])

  const commit = (v: string) => {
    if (v && v !== hex && /^#[0-9a-fA-F]{3,8}$/.test(v)) onCommit(v)
  }

  return (
    <ColorInput
      value={draft}
      onChange={setDraft}
      onChangeEnd={commit}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        // Commit directly — with `withPicker` the popover can swallow the
        // Enter-blur, and a commit that only rides on blur silently no-ops.
        if (e.key === 'Enter') {
          commit(e.currentTarget.value)
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') setDraft(hex)
      }}
      format="hex"
      withPicker
      size="xs"
      styles={{
        input: {
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          background: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        },
      }}
    />
  )
}
