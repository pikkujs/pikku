import { ChevronDown } from 'lucide-react'
import {
  Burger,
  Center,
  Collapse,
  Container,
  Divider,
  Drawer,
  Group,
  Menu,
  ScrollArea,
  UnstyledButton,
} from '@pikku/mantine/core'
import { useDisclosure } from '@mantine/hooks'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './HeaderMenu.module.css'

type NavLink = { link: string; label: () => I18nString }
type NavItem = NavLink & { links?: NavLink[] }

// Nav labels are UI copy (m.*); `link` targets are yours to wire.
const links: NavItem[] = [
  { link: '/about', label: m.headermenu__features },
  {
    link: '#1',
    label: m.headermenu__learn,
    links: [
      { link: '/docs', label: m.headermenu__documentation },
      { link: '/resources', label: m.headermenu__resources },
      { link: '/community', label: m.headermenu__community },
      { link: '/blog', label: m.headermenu__blog },
    ],
  },
  { link: '/about', label: m.headermenu__about },
  { link: '/pricing', label: m.headermenu__pricing },
  {
    link: '#2',
    label: m.headermenu__support,
    links: [
      { link: '/faq', label: m.headermenu__faq },
      { link: '/demo', label: m.headermenu__book_a_demo },
      { link: '/forums', label: m.headermenu__forums },
    ],
  },
]

export function HeaderMenu() {
  const [opened, { toggle, close }] = useDisclosure(false)

  const items = links.map((link) => {
    const menuItems = link.links?.map((item) => (
      <Menu.Item key={item.link}>{item.label()}</Menu.Item>
    ))

    if (menuItems) {
      return (
        <Menu key={link.link} trigger="hover" transitionProps={{ exitDuration: 0 }} withinPortal>
          <Menu.Target>
            <a
              href={link.link}
              className={classes.link}
              onClick={(event) => event.preventDefault()}
            >
              <Center>
                <span className={classes.linkLabel}>{link.label()}</span>
                <ChevronDown size={14} strokeWidth={1.5} />
              </Center>
            </a>
          </Menu.Target>
          <Menu.Dropdown>{menuItems}</Menu.Dropdown>
        </Menu>
      )
    }

    return (
      <a
        key={link.link}
        href={link.link}
        className={classes.link}
        onClick={(event) => event.preventDefault()}
      >
        {link.label()}
      </a>
    )
  })

  return (
    <header className={classes.header}>
      <Container size="md">
        <div className={classes.inner}>
          <Wordmark name={m.app__name()} />
          <Group gap={5} visibleFrom="sm">
            {items}
          </Group>
          <Burger
            opened={opened}
            onClick={toggle}
            size="sm"
            hiddenFrom="sm"
            aria-label={m.headermenu__toggle_navigation()}
          />
        </div>
      </Container>

      <Drawer
        opened={opened}
        onClose={close}
        size="100%"
        padding="md"
        title={m.headermenu__navigation()}
        hiddenFrom="sm"
        zIndex={1000000}
      >
        <ScrollArea h="calc(100dvh - 5rem)" mx="-md">
          <Divider my="sm" />
          {links.map((link) => {
            if (link.links) {
              return <DrawerLinksGroup key={link.link} link={link} />
            }

            return (
              <a
                key={link.link}
                href={link.link}
                className={classes.link}
                onClick={(event) => event.preventDefault()}
              >
                {link.label()}
              </a>
            )
          })}
        </ScrollArea>
      </Drawer>
    </header>
  )
}

function DrawerLinksGroup({ link }: { link: NavItem }) {
  const [opened, { toggle }] = useDisclosure(false)

  return (
    <>
      <UnstyledButton className={classes.link} onClick={toggle}>
        <Center inline>
          <span className={classes.linkLabel}>{link.label()}</span>
          <ChevronDown size={14} strokeWidth={1.5} />
        </Center>
      </UnstyledButton>
      <Collapse expanded={opened}>
        {link.links?.map((subLink) => (
          <a
            key={subLink.link}
            href={subLink.link}
            className={classes.subLink}
            onClick={(event) => event.preventDefault()}
          >
            {subLink.label()}
          </a>
        ))}
      </Collapse>
    </>
  )
}
