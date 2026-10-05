import { useState } from 'react'
import type { I18nString } from '@pikku/react'
import {
  ArrowLeftRight,
  BellRing,
  Database,
  Fingerprint,
  FileBarChart,
  Key,
  LogOut,
  MessageSquare,
  MessagesSquare,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Undo2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { SegmentedControl, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './NavbarSegmented.module.css'

type Section = 'account' | 'general'

type NavItem = {
  link: string
  // Nav labels are UI copy — m.*() message functions, never raw strings.
  label: I18nString
  icon: LucideIcon
}

// Nav structure per section. Labels are UI copy (m.*); `link` targets are yours to wire.
const tabs: Record<Section, { link: string; label: () => I18nString; icon: LucideIcon }[]> = {
  account: [
    { link: '/', label: m.navbarsegmented__notifications, icon: BellRing },
    { link: '/', label: m.navbarsegmented__billing, icon: Receipt },
    { link: '/', label: m.navbarsegmented__security, icon: Fingerprint },
    { link: '/', label: m.navbarsegmented__ssh_keys, icon: Key },
    { link: '/', label: m.navbarsegmented__databases, icon: Database },
    { link: '/', label: m.navbarsegmented__authentication, icon: ShieldCheck },
    { link: '/', label: m.navbarsegmented__other_settings, icon: Settings },
  ],
  general: [
    { link: '/', label: m.navbarsegmented__orders, icon: ShoppingCart },
    { link: '/', label: m.navbarsegmented__receipts, icon: ScrollText },
    { link: '/', label: m.navbarsegmented__reviews, icon: MessageSquare },
    { link: '/', label: m.navbarsegmented__messages, icon: MessagesSquare },
    { link: '/', label: m.navbarsegmented__customers, icon: Users },
    { link: '/', label: m.navbarsegmented__refunds, icon: Undo2 },
    { link: '/', label: m.navbarsegmented__files, icon: FileBarChart },
  ],
}

export function NavbarSegmented() {
  const [section, setSection] = useState<Section>('account')
  const [active, setActive] = useState<NavItem['label']>(m.navbarsegmented__billing())

  const links = tabs[section].map((item) => {
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
      <div>
        <Text fw={500} size="sm" className={classes.title} c="dimmed" mb="xs">
          {asI18n('bgluesticker@mantine.dev')}
        </Text>

        <SegmentedControl
          value={section}
          onChange={(value) => setSection(value as Section)}
          transitionTimingFunction="ease"
          fullWidth
          data={[
            { label: m.navbarsegmented__account(), value: 'account' },
            { label: m.navbarsegmented__system(), value: 'general' },
          ]}
        />
      </div>

      <div className={classes.navbarMain}>{links}</div>

      <div className={classes.footer}>
        <a href="#" className={classes.link} onClick={(event) => event.preventDefault()}>
          <ArrowLeftRight className={classes.linkIcon} strokeWidth={1.5} />
          <span>{m.navbarsegmented__change_account()}</span>
        </a>

        <a href="#" className={classes.link} onClick={(event) => event.preventDefault()}>
          <LogOut className={classes.linkIcon} strokeWidth={1.5} />
          <span>{m.navbarsegmented__logout()}</span>
        </a>
      </div>
    </nav>
  )
}
