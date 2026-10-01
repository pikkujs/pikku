import { useState } from 'react'
import type { I18nString } from '@pikku/react'
import {
  ArrowLeftRight,
  CalendarClock,
  Fingerprint,
  Gauge,
  Home,
  LogOut,
  Presentation,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react'
import { Center, Stack, Tooltip, UnstyledButton } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './NavbarMinimalColored.module.css'

type NavbarLinkProps = {
  icon: LucideIcon
  // Nav labels/tooltips are UI copy — pass m.*() message functions, never raw strings.
  label: I18nString
  active?: boolean
  onClick?: () => void
}

function NavbarLink({ icon: Icon, label, active, onClick }: NavbarLinkProps) {
  return (
    <Tooltip label={label} position="right" transitionProps={{ duration: 0 }}>
      <UnstyledButton
        onClick={onClick}
        className={classes.link}
        data-active={active || undefined}
        aria-label={label}
      >
        <Icon size={20} strokeWidth={1.5} />
      </UnstyledButton>
    </Tooltip>
  )
}

// Nav structure. Labels are UI copy (m.*); icons/actions are yours to wire.
const mockdata = [
  { icon: Home, label: m.navbarminimalcolored__home },
  { icon: Gauge, label: m.navbarminimalcolored__dashboard },
  { icon: Presentation, label: m.navbarminimalcolored__analytics },
  { icon: CalendarClock, label: m.navbarminimalcolored__releases },
  { icon: User, label: m.navbarminimalcolored__account },
  { icon: Fingerprint, label: m.navbarminimalcolored__security },
  { icon: Settings, label: m.navbarminimalcolored__settings },
]

export function NavbarMinimalColored() {
  const [active, setActive] = useState(2)

  const links = mockdata.map((link, index) => (
    <NavbarLink
      {...link}
      label={link.label()}
      key={index}
      active={index === active}
      onClick={() => setActive(index)}
    />
  ))

  return (
    <nav className={classes.navbar}>
      <Center>
        <Wordmark name={m.app__name()} />
      </Center>

      <div className={classes.navbarMain}>
        <Stack justify="center" gap={0}>
          {links}
        </Stack>
      </div>

      <Stack justify="center" gap={0}>
        <NavbarLink icon={ArrowLeftRight} label={m.navbarminimalcolored__change_account()} />
        <NavbarLink icon={LogOut} label={m.navbarminimalcolored__logout()} />
      </Stack>
    </nav>
  )
}
