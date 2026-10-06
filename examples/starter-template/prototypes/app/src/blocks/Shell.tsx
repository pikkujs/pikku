import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

export type NavItem = { to: string; label: string }

export const Shell = ({ name, nav, children }: { name: string; nav: NavItem[]; children: ReactNode }) => (
  <div className="min-h-screen">
    <div className="border-b border-border">
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
        <b className="text-lg">{name}</b>
        {nav.map((item) => (
          <Link key={item.to} to={item.to} className="text-muted-foreground hover:text-foreground [&.active]:font-semibold [&.active]:text-foreground">
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">{children}</main>
  </div>
)
