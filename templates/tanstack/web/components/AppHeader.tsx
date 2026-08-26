import type * as React from 'react'
import { Link } from '@tanstack/react-router'

export const AppHeader: React.FC = () => {
  return (
    <header className="header">
      <h1>
        <Link to="/">Todos</Link>
      </h1>
    </header>
  )
}
