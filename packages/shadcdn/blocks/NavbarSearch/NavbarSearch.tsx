import { Input } from '@/components/ui/input'
import { m } from '@/i18n/messages'

export function NavbarSearch() {
  const links = [m.navbarsearch__l1(), m.navbarsearch__l2(), m.navbarsearch__l3()]
  return (
    <nav className="flex h-screen w-64 flex-col gap-4 border-e bg-card p-3">
      <Input type="search" placeholder={m.navbarsearch__search()} aria-label={m.navbarsearch__search()} />
      <div>
        <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{m.navbarsearch__section()}</p>
        <ul className="flex flex-col gap-1">
          {links.map((link) => (
            <li key={link}>
              <a href="#" className="block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">{link}</a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
