import { useState } from 'react'
import type { I18nString } from '@pikku/react'
import {
  CalendarClock,
  Fingerprint,
  Gauge,
  Home,
  Presentation,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react'
import { Title, Tooltip, UnstyledButton } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './DoubleNavbar.module.css'

// Icon rail. Labels are UI copy (m.*); icons/actions are yours to wire.
const mainLinksMockdata: { icon: LucideIcon; label: () => I18nString }[] = [
  { icon: Home, label: m.doublenavbar__home },
  { icon: Gauge, label: m.doublenavbar__dashboard },
  { icon: Presentation, label: m.doublenavbar__analytics },
  { icon: CalendarClock, label: m.doublenavbar__releases },
  { icon: User, label: m.doublenavbar__account },
  { icon: Fingerprint, label: m.doublenavbar__security },
  { icon: Settings, label: m.doublenavbar__settings },
]

// Secondary link column. Labels are UI copy (m.*).
const linksMockdata: (() => I18nString)[] = [
  m.doublenavbar__security,
  m.doublenavbar__settings,
  m.doublenavbar__dashboard,
  m.doublenavbar__releases,
  m.doublenavbar__account,
  m.doublenavbar__orders,
  m.doublenavbar__clients,
  m.doublenavbar__databases,
  m.doublenavbar__pull_requests,
  m.doublenavbar__open_issues,
  m.doublenavbar__wiki_pages,
]

export function DoubleNavbar() {
  const [active, setActive] = useState<I18nString>(m.doublenavbar__releases())
  const [activeLink, setActiveLink] = useState<I18nString>(m.doublenavbar__settings())

  const mainLinks = mainLinksMockdata.map((link, index) => {
    const label = link.label()
    return (
      <Tooltip
        label={label}
        position="right"
        withArrow
        transitionProps={{ duration: 0 }}
        key={index}
      >
        <UnstyledButton
          onClick={() => setActive(label)}
          className={classes.mainLink}
          data-active={label === active || undefined}
          aria-label={label}
        >
          <link.icon size={22} strokeWidth={1.5} />
        </UnstyledButton>
      </Tooltip>
    )
  })

  const links = linksMockdata.map((link, index) => {
    const label = link()
    return (
      <a
        className={classes.link}
        data-active={activeLink === label || undefined}
        href="#"
        onClick={(event) => {
          event.preventDefault()
          setActiveLink(label)
        }}
        key={index}
      >
        {label}
      </a>
    )
  })

  return (
    <nav className={classes.navbar}>
      <div className={classes.wrapper}>
        <div className={classes.aside}>
          <div className={classes.logo}>
            <Wordmark name={m.app__name()} />
          </div>
          {mainLinks}
        </div>
        <div className={classes.main}>
          <Title order={4} className={classes.title}>
            {active}
          </Title>

          {links}
        </div>
      </div>
    </nav>
  )
}
