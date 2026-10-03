import { m } from '@/i18n/messages'

export function FooterSimple() {
  const links = [m.footersimple__link1(), m.footersimple__link2(), m.footersimple__link3()]
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
        <span className="font-semibold">{m.footersimple__brand()}</span>
        <nav className="flex gap-6 text-sm text-muted-foreground">
          {links.map((link) => (
            <a key={link} href="#" className="hover:text-foreground">{link}</a>
          ))}
        </nav>
        <span className="text-sm text-muted-foreground">{m.footersimple__copyright()}</span>
      </div>
    </footer>
  )
}
