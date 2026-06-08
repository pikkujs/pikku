import React from 'react'

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

export const I18nHero: React.FC = () => {
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
