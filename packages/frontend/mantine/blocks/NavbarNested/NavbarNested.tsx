import {
  SlidersHorizontal,
  CalendarClock,
  FileText,
  Gauge,
  Lock,
  Notebook,
  Presentation,
} from 'lucide-react'
import { ScrollArea } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import { LinksGroup } from './NavbarLinksGroup'
import { UserButton } from './UserButton'
import classes from './NavbarNested.module.css'

// Nav structure. Labels are UI copy (m.*); `link` targets are yours to wire.
const navData = [
  { label: m.navbarnested__dashboard, icon: Gauge },
  {
    label: m.navbarnested__market_news,
    icon: Notebook,
    initiallyOpened: true,
    links: [
      { label: m.navbarnested__overview, link: '/' },
      { label: m.navbarnested__forecasts, link: '/' },
      { label: m.navbarnested__outlook, link: '/' },
      { label: m.navbarnested__real_time, link: '/' },
    ],
  },
  {
    label: m.navbarnested__releases,
    icon: CalendarClock,
    links: [
      { label: m.navbarnested__upcoming_releases, link: '/' },
      { label: m.navbarnested__previous_releases, link: '/' },
      { label: m.navbarnested__releases_schedule, link: '/' },
    ],
  },
  { label: m.navbarnested__analytics, icon: Presentation },
  { label: m.navbarnested__contracts, icon: FileText },
  { label: m.navbarnested__settings, icon: SlidersHorizontal },
  {
    label: m.navbarnested__security,
    icon: Lock,
    links: [
      { label: m.navbarnested__enable_2fa, link: '/' },
      { label: m.navbarnested__change_password, link: '/' },
      { label: m.navbarnested__recovery_codes, link: '/' },
    ],
  },
]

export function NavbarNested() {
  const links = navData.map((item, i) => (
    <LinksGroup
      {...item}
      label={item.label()}
      links={item.links?.map((l) => ({ label: l.label(), link: l.link }))}
      key={i}
    />
  ))

  return (
    <nav className={classes.navbar}>
      <div className={classes.header}>
        <Wordmark name={m.app__name()} />
      </div>

      <ScrollArea className={classes.links}>
        <div className={classes.linksInner}>{links}</div>
      </ScrollArea>

      <div className={classes.footer}>
        <UserButton
          name={asI18n('Harriette Spoonlicker')}
          email={asI18n('hspoonlicker@outlook.com')}
        />
      </div>
    </nav>
  )
}
