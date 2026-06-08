import React from 'react'

type SeatProps = { initials?: string; color?: string; size?: number; dashed?: boolean }

const Seat: React.FC<SeatProps> = ({ initials, color, size = 44, dashed }) => {
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

export const SeatsHero: React.FC = () => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {[0, 1].map(k => <span key={'d' + k} style={{ marginLeft: k ? -12 : 0, opacity: 0.85 }}><Seat dashed size={44} /></span>)}
      <span style={{ marginLeft: -12, zIndex: 3 }}><Seat initials="You" color="var(--app-accent)" size={58} /></span>
      {[0, 1].map(k => <span key={'e' + k} style={{ marginLeft: -12, opacity: 0.85 }}><Seat dashed size={44} /></span>)}
    </div>
  )
}
