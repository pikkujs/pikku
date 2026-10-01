import { useState } from 'react'
import {
  ShieldCheck,
  BellRing,
  Database,
  Fingerprint,
  Key,
  LogOut,
  Receipt,
  Settings,
  ArrowLeftRight,
} from 'lucide-react'
import { Code, Group } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './NavbarSimple.module.css'

// Nav rows. Labels are UI copy (m.*); `link` targets are yours to wire.
const data = [
  { link: '', label: m.navbarsimple__notifications, icon: BellRing },
  { link: '', label: m.navbarsimple__billing, icon: Receipt },
  { link: '', label: m.navbarsimple__security, icon: Fingerprint },
  { link: '', label: m.navbarsimple__ssh_keys, icon: Key },
  { link: '', label: m.navbarsimple__databases, icon: Database },
  { link: '', label: m.navbarsimple__authentication, icon: ShieldCheck },
  { link: '', label: m.navbarsimple__other_settings, icon: Settings },
]

export function NavbarSimple() {
  const [active, setActive] = useState(m.navbarsimple__billing())

  const links = data.map((item) => {
    const label = item.label()
    return (
      <a
        className={classes.link}
        data-active={label === active || undefined}
        href={item.link}
        key={label}
        onClick={(event) => {
          event.preventDefault()
          setActive(label)
        }}
      >
        <item.icon className={classes.linkIcon} strokeWidth={1.5} />
        <span>{label}</span>
      </a>
    )
  })

  return (
    <nav className={classes.navbar}>
      <div className={classes.navbarMain}>
        <Group className={classes.header} justify="space-between">
          <Wordmark name={m.app__name()} />
          <Code fw={700}>{asI18n('v3.1.2')}</Code>
        </Group>
        {links}
      </div>

      <div className={classes.footer}>
        <a href="#" className={classes.link} onClick={(event) => event.preventDefault()}>
          <ArrowLeftRight className={classes.linkIcon} strokeWidth={1.5} />
          <span>{m.navbarsimple__change_account()}</span>
        </a>

        <a href="#" className={classes.link} onClick={(event) => event.preventDefault()}>
          <LogOut className={classes.linkIcon} strokeWidth={1.5} />
          <span>{m.navbarsimple__logout()}</span>
        </a>
      </div>
    </nav>
  )
}
