import React from 'react'

export const LabsHero: React.FC = () => {
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
