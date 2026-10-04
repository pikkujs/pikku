import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function HeaderSimple() {
  const links = [m.headersimple__link1(), m.headersimple__link2(), m.headersimple__link3()]
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <span className="font-semibold">{m.headersimple__brand()}</span>
        <nav className="hidden gap-6 text-sm md:flex">
          {links.map((link) => (
            <a key={link} href="#" className="text-muted-foreground hover:text-foreground">{link}</a>
          ))}
        </nav>
        <Button size="sm">{m.headersimple__cta()}</Button>
      </div>
    </header>
  )
}
