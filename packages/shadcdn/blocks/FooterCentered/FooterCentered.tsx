import { m } from '@/i18n/messages'

export function FooterCentered() {
  const links = [m.footercentered__link1(), m.footercentered__link2(), m.footercentered__link3()]
  return (
    <footer className="border-t px-6 py-10 text-center">
      <p className="font-semibold">{m.footercentered__brand()}</p>
      <nav className="mt-4 flex justify-center gap-6 text-sm text-muted-foreground">
        {links.map((link) => (
          <a key={link} href="#" className="hover:text-foreground">{link}</a>
        ))}
      </nav>
      <p className="mt-6 text-sm text-muted-foreground">{m.footercentered__copyright()}</p>
    </footer>
  )
}
