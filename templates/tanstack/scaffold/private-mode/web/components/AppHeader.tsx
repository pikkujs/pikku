import type * as React from 'react'
import { Link } from '@tanstack/react-router'
import { useLockStatus } from '../lib/use-lock-status'

const LABEL: Record<string, string> = {
  uninitialized: 'store not yet initialized',
  locked: 'store locked',
  unlocked: 'store unlocked',
}

export const AppHeader: React.FC = () => {
  const status = useLockStatus()

  return (
    <header className="header">
      <h1>
        <Link to="/">Todos</Link>
      </h1>
      <span>{status ? LABEL[status.state] : 'checking store…'}</span>
    </header>
  )
}
