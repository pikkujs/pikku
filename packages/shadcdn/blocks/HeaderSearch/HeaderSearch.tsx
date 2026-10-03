import { Input } from '@/components/ui/input'
import { m } from '@/i18n/messages'

export function HeaderSearch() {
  const links = [m.headersearch__l1(), m.headersearch__l2()]
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <span className="font-semibold">{m.headersearch__brand()}</span>
        <nav className="flex gap-4 text-sm text-muted-foreground">
          {links.map((link) => (
            <a key={link} href="#" className="hover:text-foreground">{link}</a>
          ))}
        </nav>
        <Input type="search" placeholder={m.headersearch__search()} aria-label={m.headersearch__search()} className="ms-auto max-w-56" />
      </div>
    </header>
  )
}
