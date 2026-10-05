// ─────────────────────────────────────────────────────────────────────────────
// ArtifactDialog — the artifact picker, opened from the chevron in the
// sub-header. It replaces the old left sidebar: an artifact is something you pick
// and then read full-bleed, so a permanent 264px column spent its width on a list
// the user reads once per switch.
//
// Spotlight-shaped: a filter field at the top, then one ROW per artifact. The
// rows carry no thumbnail. An artifact is a whole HTML document, so a preview of
// one is an iframe, and a list of eight rows would be eight documents loading at
// once for a dialog that is open for a few seconds. The row names the page, how
// many options are on it, and which version it is.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { Plus, Search, Trash2, X } from 'lucide-react'
import type { DesignArtifact } from '@/lib/discovery'
import { m } from '@/lib/i18n'
import { MONO } from './chrome'

export function ArtifactDialog({
  artifacts,
  selectedId,
  error,
  onSelect,
  onDelete,
  onNew,
  onClose,
}: {
  artifacts: DesignArtifact[]
  selectedId: string | null
  /** Set when the directory listing itself failed — distinct from "none yet". */
  error: string | null
  onSelect: (id: string) => void
  onDelete: (file: string, name: string) => void
  onNew: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const needle = query.trim().toLowerCase()
  const visible = needle
    ? artifacts.filter(
        (a) => a.name.toLowerCase().includes(needle) || a.id.toLowerCase().includes(needle),
      )
    : artifacts

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '72px 20px 20px',
        background: 'rgba(15, 18, 24, 0.42)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        role="dialog"
        aria-label={m.dialog_title()}
        data-testid="artifact-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderRadius: 14,
          background: 'var(--app-panel-bg)',
          border: '0.5px solid var(--app-border)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 14px',
            height: 46,
            flexShrink: 0,
            borderBottom: '0.5px solid var(--app-border)',
          }}
        >
          <Search size={14} color="var(--app-text-faint)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m.dialog_search()}
            style={{
              flex: 1,
              border: 0,
              outline: 'none',
              background: 'transparent',
              font: 'inherit',
              fontSize: 13.5,
              color: 'var(--app-text)',
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={m.dialog_close()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 6,
              border: 0,
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--app-text-faint)',
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
          {error && <Notice tone="error">{m.dialog_read_failed({ reason: error })}</Notice>}
          {!error && artifacts.length === 0 && (
            <Notice tone="empty">
              {m.dialog_none_yet()}{' '}
              <span style={{ fontFamily: MONO, fontSize: 11.5 }}>artifacts/</span>.
            </Notice>
          )}
          {!error && artifacts.length > 0 && visible.length === 0 && (
            <Notice tone="empty">{m.dialog_no_match({ query })}</Notice>
          )}
          {visible.map((artifact) => (
            <ArtifactRow
              key={artifact.id}
              artifact={artifact}
              selected={artifact.id === selectedId}
              onSelect={() => onSelect(artifact.id)}
              onDelete={() => onDelete(artifact.file, artifact.name)}
            />
          ))}
        </div>

        <div style={{ flexShrink: 0, borderTop: '0.5px solid var(--app-border)', padding: 8 }}>
          <button
            type="button"
            onClick={onNew}
            data-testid="artifact-dialog-new"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              textAlign: 'left',
              padding: '9px 10px',
              borderRadius: 10,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 600,
              border: '0.5px dashed var(--app-blue-border)',
              background: 'transparent',
              color: 'var(--app-accent)',
            }}
          >
            <Plus size={14} />
            {m.dialog_new()}
          </button>
        </div>
      </div>
    </div>
  )
}

function ArtifactRow({
  artifact,
  selected,
  onSelect,
  onDelete,
}: {
  artifact: DesignArtifact
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const [hover, setHover] = useState(false)
  const acc = 'var(--app-accent)'
  const count = artifact.options.length

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`artifact-row-${artifact.id}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 8px',
        borderRadius: 11,
        cursor: 'pointer',
        border: `0.5px solid ${selected ? acc : 'transparent'}`,
        background: selected
          ? 'var(--app-surface-info)'
          : hover
            ? 'var(--app-panel-bg-strong)'
            : 'transparent',
        transition: 'background 120ms, border-color 120ms',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: selected ? acc : 'var(--app-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {artifact.name}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 2,
            fontFamily: MONO,
            fontSize: 10,
            color: 'var(--app-text-faint)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {count > 0
            ? `${count === 1 ? m.dialog_option_count_one() : m.dialog_option_count({ count })} · `
            : ''}
          {artifact.file}
        </span>
      </span>
      <span
        role="button"
        tabIndex={0}
        aria-label={m.dialog_delete_named({ name: artifact.name })}
        title={m.dialog_delete()}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation()
            onDelete()
          }
        }}
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: 7,
          color: 'var(--app-text-faint)',
          cursor: 'pointer',
          opacity: hover || selected ? 1 : 0,
          transition: 'opacity 120ms',
        }}
      >
        <Trash2 size={14} />
      </span>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'error' | 'empty'; children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        padding: '18px 14px',
        fontSize: 12,
        lineHeight: 1.6,
        textAlign: 'center',
        color: tone === 'error' ? 'var(--app-danger)' : 'var(--app-text-faint)',
      }}
    >
      {children}
    </p>
  )
}
