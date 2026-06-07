import React from 'react'

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

function Panel({ children, style, w }: { children: React.ReactNode; style?: React.CSSProperties; w?: number | string }) {
  return (
    <div style={{ width: w, background: 'var(--app-panel-bg)', border: '0.5px solid var(--app-border)',
      borderRadius: 12, boxShadow: 'var(--app-shadow-sm)', overflow: 'hidden', ...style }}>
      {children}
    </div>
  )
}

function Bar({ w, h = 7, c = 'var(--app-text-muted)', r = 4 }: { w: number; h?: number; c?: string; r?: number }) {
  return <span style={{ display: 'block', width: w, height: h, borderRadius: r, background: c }} />
}

/* Members / Settings — overlapping avatar seats */
export function SeatsHero() {
  function Seat({ initials, color, size = 44, dashed }: { initials?: string; color?: string; size?: number; dashed?: boolean }) {
    if (dashed) return (
      <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
        border: '1.5px dashed var(--app-border-strong, var(--app-border))', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: 'var(--app-text-faint)', background: 'var(--app-page-bg, var(--mantine-color-body))',
        boxShadow: '0 0 0 4px var(--app-page-bg, var(--mantine-color-body))' }}>
        <svg width={size * 0.40} height={size * 0.40} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
    )
    return (
      <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: color, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.28, fontWeight: 600,
        fontFamily: 'inherit', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,.10), 0 0 0 4px var(--app-page-bg, var(--mantine-color-body))' }}>
        {initials}
      </span>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {[0, 1].map(k => <span key={'d' + k} style={{ marginLeft: k ? -12 : 0, opacity: 0.85 }}><Seat dashed size={44} /></span>)}
      <span style={{ marginLeft: -12, zIndex: 3 }}><Seat initials="You" color="var(--app-accent)" size={58} /></span>
      {[0, 1].map(k => <span key={'e' + k} style={{ marginLeft: -12, opacity: 0.85 }}><Seat dashed size={44} /></span>)}
    </div>
  )
}

/* Tests — mini test report panel */
export function TestsHero() {
  const STATUS = { pass: 'var(--app-green)', work: 'var(--app-amber)', fail: 'var(--app-red)' }
  const rows: Array<{ s: 'pass' | 'work' | 'fail'; w: number }> = [{ s: 'pass', w: 116 }, { s: 'work', w: 92 }, { s: 'fail', w: 104 }]
  const icons = { pass: 'M20 6 9 17l-5-5', work: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3 2', fail: 'M18 6 6 18M6 6l12 12' }
  return (
    <Panel w={264}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 13px',
        borderBottom: '0.5px solid var(--app-border)' }}>
        <Bar w={70} h={7} c="var(--app-text-dim)" />
        <span style={{ display: 'flex', gap: 5 }}>
          {(['pass', 'work', 'fail'] as const).map(s => (
            <span key={s} style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS[s] }} />
          ))}
        </span>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px',
          borderBottom: i < rows.length - 1 ? '0.5px solid var(--app-border)' : undefined }}>
          <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: `color-mix(in srgb, ${STATUS[r.s]} 16%, transparent)` }}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
              stroke={STATUS[r.s]} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d={icons[r.s]} />
            </svg>
          </span>
          <Bar w={r.w} h={7} c="var(--app-text-muted)" />
        </div>
      ))}
    </Panel>
  )
}

/* Design — theme palette swatches + button previews */
export function DesignHero() {
  const swatches = ['var(--app-accent)', '#0ea5a3', 'var(--app-green)', 'var(--app-amber)', 'var(--app-red)', '#7c6cf0']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Panel w="auto" style={{ display: 'flex', gap: 8, padding: 10 }}>
        {swatches.map((c, i) => (
          <span key={i} style={{ width: 30, height: 38, borderRadius: 7, background: c,
            boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,.10)' }} />
        ))}
      </Panel>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['var(--app-accent)', 'var(--app-panel-bg-strong, var(--app-panel-bg))'] as const).map((bg, i) => (
          <span key={i} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            color: i ? 'var(--app-text-dim)' : '#fff', background: bg,
            border: i ? '0.5px solid var(--app-border)' : 'none' }}>Button</span>
        ))}
      </div>
    </div>
  )
}

/* Database — two table cards with a relation connector */
function DbTable() {
  return (
    <Panel w={104}>
      <div style={{ padding: '7px 10px', borderBottom: '0.5px solid var(--app-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="var(--app-text-faint)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3zM3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
        </svg>
        <Bar w={46} h={6} c="var(--app-text-dim)" />
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ padding: '7px 10px', borderBottom: i < 2 ? '0.5px solid var(--app-border)' : undefined }}>
          <Bar w={i === 1 ? 56 : 72} h={5} c="var(--app-text-muted)" />
        </div>
      ))}
    </Panel>
  )
}

export function DatabaseHero() {
  const connColor = 'var(--app-border-strong, var(--app-border))'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <DbTable />
      <span style={{ width: 28, height: 1, background: connColor, position: 'relative', display: 'block' }}>
        <span style={{ position: 'absolute', left: 0, top: -2.5, width: 5, height: 5, borderRadius: '50%', background: connColor }} />
        <span style={{ position: 'absolute', right: 0, top: -2.5, width: 5, height: 5, borderRadius: '50%', background: connColor }} />
      </span>
      <DbTable />
    </div>
  )
}

/* Content — row of file tiles */
export function ContentHero() {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 72, opacity: i === 2 ? 0.55 : 1 }}>
          <div style={{ height: 56, borderRadius: 10, background: 'var(--app-panel-bg)', border: '0.5px solid var(--app-border)',
            boxShadow: 'var(--app-shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--app-text-faint)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />
            </svg>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <Bar w={48} h={5} c="var(--app-text-muted)" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* Emails — stacked email template cards */
export function EmailsHero() {
  return (
    <div style={{ position: 'relative', width: 200, height: 96 }}>
      <Panel w={168} style={{ position: 'absolute', left: 16, top: 10, transform: 'rotate(-4deg)', opacity: 0.6, padding: 12 }}>
        <Bar w={60} h={7} c="var(--app-text-muted)" />
        <div style={{ height: 7 }} />
        <Bar w={120} h={5} c="var(--app-border-strong, var(--app-border))" />
      </Panel>
      <Panel w={172} style={{ position: 'absolute', left: 12, top: 4, padding: '14px 14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--app-surface-info)',
            border: '0.5px solid var(--app-blue-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--app-accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 5L2 7" />
            </svg>
          </span>
          <Bar w={64} h={7} c="var(--app-text-dim)" />
        </div>
        <div style={{ height: 11 }} />
        <Bar w={140} h={6} c="var(--app-text-muted)" />
        <div style={{ height: 6 }} />
        <Bar w={110} h={6} c="var(--app-text-muted)" />
        <div style={{ height: 13 }} />
        <span style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 6, background: 'var(--app-accent)' }}>
          <Bar w={36} h={6} c="#fff" />
        </span>
      </Panel>
    </div>
  )
}

/* Projects — project cards + dashed "new" tile */
export function ProjectsHero() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
      {[0, 1].map(i => (
        <Panel key={i} w={92} style={{ padding: 12, opacity: i ? 0.6 : 1 }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--app-panel-bg-strong, var(--app-panel-bg))',
            border: '0.5px solid var(--app-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--app-text-faint)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <div style={{ height: 12 }} />
          <Bar w={56} h={6} c="var(--app-text-dim)" />
          <div style={{ height: 7 }} />
          <Bar w={40} h={5} c="var(--app-text-muted)" />
        </Panel>
      ))}
      <div style={{ width: 92, borderRadius: 12, border: '1.5px dashed var(--app-border-strong, var(--app-border))',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--app-text-faint)' }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
    </div>
  )
}

/* i18n — language tag chips */
export function I18nHero() {
  const langs = [{ t: 'EN', on: true }, { t: 'FR', on: true }, { t: 'ES', on: false }, { t: 'DE', on: false }, { t: 'JA', on: false }]
  return (
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 320 }}>
      {langs.map((l, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9,
          background: l.on ? 'var(--app-panel-bg)' : 'transparent',
          border: l.on ? '0.5px solid var(--app-border)' : '1.5px dashed var(--app-border-strong, var(--app-border))',
          boxShadow: l.on ? 'var(--app-shadow-sm)' : 'none',
          fontSize: 13, fontWeight: 600, fontFamily: MONO,
          color: l.on ? 'var(--app-text)' : 'var(--app-text-faint)' }}>
          {l.on && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--app-green)' }} />}
          {l.t}
        </span>
      ))}
    </div>
  )
}

/* Settings — org card preview */
export function SettingsHero() {
  return (
    <Panel w={236} style={{ padding: '16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--app-surface-info)',
          border: '0.5px solid var(--app-blue-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--app-accent)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3M9 9h.01M9 12h.01M9 15h.01M9 18h.01" />
          </svg>
        </span>
        <span style={{ flex: 1, textAlign: 'left' }}>
          <Bar w={92} h={7} c="var(--app-text-dim)" />
          <div style={{ height: 7 }} />
          <Bar w={60} h={5} c="var(--app-text-muted)" />
        </span>
      </div>
      <div style={{ height: 1, background: 'var(--app-border)', margin: '14px 0' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        {[64, 80, 52].map((w, i) => (
          <span key={i} style={{ padding: '5px 0', flex: w, borderRadius: 6,
            background: 'var(--app-panel-bg-strong, var(--app-panel-bg))', border: '0.5px solid var(--app-border)' }} />
        ))}
      </div>
    </Panel>
  )
}

/* Labs — flask with sparkle */
export function LabsHero() {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--app-surface-info)',
        border: '0.5px solid var(--app-blue-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--app-accent)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 2v7.31l-5.6 9.7A2 2 0 0 0 6.13 22h11.74a2 2 0 0 0 1.73-3l-5.6-9.69V2M8.5 2h7M7 16h10" />
        </svg>
      </span>
      <span style={{ position: 'absolute', top: -8, right: -10 }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--app-amber)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
        </svg>
      </span>
    </div>
  )
}

/* Sandbox / Hammer — for the vibe sandbox empty state */
export function SandboxHero() {
  return (
    <div style={{ position: 'relative', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
      <Panel w={80} style={{ padding: 10, opacity: 0.55 }}>
        <Bar w={52} h={6} c="var(--app-text-dim)" />
        <div style={{ height: 8 }} />
        <Bar w={40} h={5} c="var(--app-text-muted)" />
        <div style={{ height: 6 }} />
        <Bar w={48} h={5} c="var(--app-text-muted)" />
      </Panel>
      <div style={{ width: 88, borderRadius: 12, border: '1.5px dashed var(--app-border-strong, var(--app-border))',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '16px 0', color: 'var(--app-text-faint)' }}>
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M12 5v1M12 18v1M5 12H4M20 12h-1M6.34 6.34l-.71-.71M18.36 18.36l-.71-.71M18.36 6.34l.71-.71M6.05 18.36l.71-.71" />
        </svg>
        <Bar w={48} h={5} c="var(--app-text-faint)" />
      </div>
      <Panel w={80} style={{ padding: 10, opacity: 0.3 }}>
        <Bar w={52} h={6} c="var(--app-text-dim)" />
        <div style={{ height: 8 }} />
        <Bar w={36} h={5} c="var(--app-text-muted)" />
      </Panel>
    </div>
  )
}
