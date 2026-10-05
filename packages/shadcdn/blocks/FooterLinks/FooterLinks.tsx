import { m } from '@/i18n/messages'

export function FooterLinks() {
  const groups = [
    { title: m.footerlinks__g1(), links: [m.footerlinks__g1_l1(), m.footerlinks__g1_l2()] },
    { title: m.footerlinks__g2(), links: [m.footerlinks__g2_l1(), m.footerlinks__g2_l2()] },
  ]
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-3">
        <div>
          <p className="font-semibold">{m.footerlinks__brand()}</p>
          <p className="mt-2 text-sm text-muted-foreground">{m.footerlinks__tagline()}</p>
        </div>
        {groups.map((group) => (
          <div key={group.title}>
            <p className="text-sm font-medium">{group.title}</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              {group.links.map((link) => (
                <li key={link}>
                  <a href="#" className="hover:text-foreground">{link}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  )
}
