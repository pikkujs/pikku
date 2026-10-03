// ─────────────────────────────────────────────────────────────────────────────
// ArtifactView — one page the design agent drew, in an iframe, with the options
// on it pickable.
//
// The iframe is not a framing choice, it is the isolation: an artifact is
// freehand HTML written by an agent, and before this the design surface imported
// it as a module, so a page that did not parse took the whole shell down with it.
// Across the boundary the worst case is a blank frame.
//
// Two things have to cross that boundary anyway:
//   - The USER's theme. The page is written against the shadcn tokens
//     (`var(--primary)` and friends), so the theme CSS is portalled into the
//     artifact document's head as a <style> and re-emits live when the theme
//     changes; the `dark` class on its root follows the scheme.
//   - The OPTIONS. They are the sections carrying `data-artifact-option`, read
//     out of the loaded document rather than trusted from the index, so the rail
//     always names what is actually on screen.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Monitor, Plus, Smartphone, Sparkles, Tablet } from 'lucide-react'
import { artifactUrl, type DesignArtifact } from '@/lib/discovery'
import { DEVICE_SIZES, type DeviceMode } from '@/lib/DeviceFrame'
import { m } from '@/lib/i18n'
import { requestAdoptOption, requestRefineOption } from '@/lib/host'
import { MONO } from '@/shell/chrome'

export function ArtifactView({
  artifact,
  sketching,
  onNew,
  onOpenPicker,
  userTheme,
  colorScheme,
}: {
  artifact: DesignArtifact | undefined
  sketching: boolean
  onNew: () => void
  onOpenPicker: () => void
  userTheme: string
  colorScheme: 'light' | 'dark'
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [doc, setDoc] = useState<Document | null>(null)
  const [options, setOptions] = useState<string[]>([])
  const [device, setDevice] = useState<DeviceMode>('desktop')
  useEffect(() => {
    doc?.documentElement.classList.toggle('dark', colorScheme === 'dark')
  }, [doc, colorScheme])
  const [version, setVersion] = useState<string | null>(null)

  const file = version && artifact?.versions.includes(version) ? version : artifact?.file

  useEffect(() => {
    setVersion(null)
    setDoc(null)
    setOptions([])
  }, [artifact?.id])

  const onLoad = useCallback(() => {
    const inner = frameRef.current?.contentDocument ?? null
    setDoc(inner)
    setOptions(
      inner
        ? [...inner.querySelectorAll('[data-artifact-option]')].map(
            (node) => node.getAttribute('data-artifact-option') ?? '',
          )
        : [],
    )
  }, [])

  const scrollTo = (option: string) => {
    doc
      ?.querySelector(`[data-artifact-option="${CSS.escape(option)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!artifact) {
    return sketching ? (
      <Empty title={m.artifact_sketching_title()} body={m.artifact_sketching_body()} />
    ) : (
      <Empty title={m.artifact_empty_title()} body={m.artifact_empty_body()} onNew={onNew} />
    )
  }

  const size = device === 'desktop' ? null : DEVICE_SIZES[device]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          borderBottom: '0.5px solid var(--app-border)',
          background: 'var(--app-panel-bg)',
        }}
      >
        <button type="button" onClick={onOpenPicker} style={switcherStyle}>
          {artifact.name}
          <ChevronDown size={13} />
        </button>
        {artifact.versions.length > 1 && (
          <select
            value={file}
            onChange={(event) => setVersion(event.target.value)}
            aria-label={m.artifact_version()}
            style={{ ...switcherStyle, fontFamily: MONO, fontSize: 11 }}
          >
            {artifact.versions.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        )}
        <div style={{ flex: 1 }} />
        {DEVICES.map(({ id, Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setDevice(id)}
            title={label()}
            aria-label={label()}
            aria-pressed={device === id}
            style={{ ...iconButtonStyle, color: device === id ? 'var(--app-accent)' : 'inherit' }}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            padding: size ? 20 : 0,
            background: 'var(--app-canvas-bg, transparent)',
          }}
        >
          <iframe
            key={file}
            ref={frameRef}
            onLoad={onLoad}
            title={artifact.name}
            src={file ? artifactUrl(file) : undefined}
            style={{
              width: size?.width ?? '100%',
              height: size?.height ?? '100%',
              flexShrink: 0,
              border: size ? '1px solid var(--app-border)' : 'none',
              borderRadius: size?.radius ?? 0,
              background: '#fff',
            }}
          />
          {doc &&
            createPortal(
              <style>{userTheme}</style>,
              doc.head,
            )}
        </div>

        <div
          style={{
            width: 232,
            flexShrink: 0,
            borderLeft: '0.5px solid var(--app-border)',
            background: 'var(--app-panel-bg)',
            overflowY: 'auto',
            padding: 12,
          }}
        >
          <div style={labelStyle}>{m.artifact_options()}</div>
          {options.length === 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--app-text-faint)' }}>
              {m.artifact_no_options()}
            </p>
          )}
          {options.map((option) => (
            <div key={option} style={{ marginBottom: 10 }}>
              <button type="button" onClick={() => scrollTo(option)} style={optionNameStyle}>
                {option}
              </button>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button
                  type="button"
                  title={m.artifact_refine_hint()}
                  onClick={() => requestRefineOption(file!, option)}
                  style={actionStyle}
                >
                  {m.artifact_refine()}
                </button>
                <button
                  type="button"
                  title={m.artifact_adopt_hint()}
                  onClick={() => requestAdoptOption(file!, option)}
                  style={{ ...actionStyle, color: 'var(--app-accent)' }}
                >
                  {m.artifact_adopt()}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const DEVICES = [
  { id: 'desktop' as const, Icon: Monitor, label: m.artifact_device_desktop },
  { id: 'tablet' as const, Icon: Tablet, label: m.artifact_device_tablet },
  { id: 'mobile' as const, Icon: Smartphone, label: m.artifact_device_mobile },
]

function Empty({ title, body, onNew }: { title: string; body: string; onNew?: () => void }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 40,
        textAlign: 'center',
      }}
    >
      {onNew ? <Sparkles size={20} color="var(--app-accent)" /> : null}
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      <p style={{ maxWidth: 380, fontSize: 12, lineHeight: 1.6, color: 'var(--app-text-faint)' }}>
        {body}
      </p>
      {onNew && (
        <button type="button" onClick={onNew} style={{ ...actionStyle, padding: '8px 14px' }}>
          <Plus size={13} />
          {m.artifact_empty_action()}
        </button>
      )}
    </div>
  )
}

const switcherStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  borderRadius: 8,
  border: '0.5px solid var(--app-border)',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
} as const

const iconButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  borderRadius: 7,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
} as const

const labelStyle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--app-text-faint)',
  marginBottom: 8,
} as const

const optionNameStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
} as const

const actionStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 8px',
  borderRadius: 7,
  border: '0.5px solid var(--app-border)',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
} as const
