import { m } from '@/i18n/messages'

export function TableOfContents() {
  const sections = [m.tableofcontents__s1(), m.tableofcontents__s2(), m.tableofcontents__s3()]
  return (
    <nav aria-label={m.tableofcontents__title()} className="max-w-xs border-s ps-4">
      <p className="mb-2 text-sm font-medium">{m.tableofcontents__title()}</p>
      <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
        {sections.map((section) => (
          <li key={section}>
            <a href="#" className="hover:text-foreground">{section}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
