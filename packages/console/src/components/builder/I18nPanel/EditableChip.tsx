import { useEffect, useRef, useState } from 'react'

// ─── Editable chip (mirrors DesignPanel) ─────────────────────────────────────

export function EditableChip({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])
  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const t = draft.trim()
    if (t !== value) onChange(t)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setEditing(false)
            setDraft(value)
          }
        }}
        style={{
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          background: 'var(--app-panel-bg)',
          border: '1px solid var(--mantine-color-blue-5)',
          borderRadius: 5,
          color: 'var(--app-text)',
          padding: '4px 8px',
          width: '100%',
          outline: 'none',
        }}
      />
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          setDraft(value)
          setEditing(true)
        }
      }}
      style={{
        fontSize: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: 'var(--app-text)',
        background: 'var(--app-panel-bg)',
        border: '1px solid var(--app-border)',
        borderRadius: 5,
        padding: '4px 8px',
        cursor: 'text',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
      title={value}
    >
      {value || <span style={{ opacity: 0.4 }}>—</span>}
    </div>
  )
}
