import { Outlet } from '@tanstack/react-router'
import { m } from '@/i18n/messages'
import { signOut } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { MobileTabBar, NavList, useNavItems } from './layout/nav'

export function AppShell() {
  const items = useNavItems()
  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 flex-col gap-4 border-e p-4 md:flex">
        <span className="font-heading text-lg font-semibold">{m.app__name()}</span>
        <NavList items={items} />
        <Button
          variant="ghost"
          className="mt-auto justify-start"
          onClick={() => signOut().then(() => { window.location.href = '/app/auth/login' })}
        >
          {m.app_shell__sign_out()}
        </Button>
      </aside>
      <main className="flex-1 p-4 pb-20 md:p-8 md:pb-8">
        <Outlet />
      </main>
      <MobileTabBar items={items} />
    </div>
  )
}
