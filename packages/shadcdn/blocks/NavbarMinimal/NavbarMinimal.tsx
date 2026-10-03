import { Home, Search, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function NavbarMinimal() {
  const links = [
    { label: m.navbarminimal__home(), icon: Home },
    { label: m.navbarminimal__search(), icon: Search },
    { label: m.navbarminimal__settings(), icon: Settings },
  ]
  return (
    <nav className="flex h-screen w-14 flex-col items-center gap-1 border-e bg-card py-3">
      {links.map(({ label, icon: Icon }) => (
        <Button key={label} variant="ghost" size="icon" aria-label={label}>
          <Icon className="size-5" />
        </Button>
      ))}
    </nav>
  )
}
