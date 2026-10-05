import { FolderKanban, Home, LogOut, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function NavbarSimple() {
  const links = [
    { label: m.navbarsimple__home(), icon: Home },
    { label: m.navbarsimple__projects(), icon: FolderKanban },
    { label: m.navbarsimple__settings(), icon: Settings },
  ]
  return (
    <nav className="flex h-screen w-60 flex-col border-e bg-card p-3">
      <ul className="flex flex-1 flex-col gap-1">
        {links.map(({ label, icon: Icon }) => (
          <li key={label}>
            <a href="#" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
              <Icon className="size-4" />
              {label}
            </a>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="row">
        <LogOut className="size-4" />
        {m.navbarsimple__sign_out()}
      </Button>
    </nav>
  )
}
