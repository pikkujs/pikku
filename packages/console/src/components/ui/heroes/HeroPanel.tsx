import React from 'react'

type HeroPanelProps = {
  children: React.ReactNode
  style?: React.CSSProperties
  w?: number | string
}

export const HeroPanel: React.FC<HeroPanelProps> = ({ children, style, w }) => {
  return (
    <div style={{ width: w, background: 'var(--app-panel-bg)', border: '0.5px solid var(--app-border)',
      borderRadius: 12, boxShadow: 'var(--app-shadow-sm)', overflow: 'hidden', ...style }}>
      {children}
    </div>
  )
}
