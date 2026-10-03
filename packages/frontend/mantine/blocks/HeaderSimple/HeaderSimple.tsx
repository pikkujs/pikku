import { useState } from 'react'
import { Burger, Container, Divider, Drawer, Group, ScrollArea } from '@pikku/mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './HeaderSimple.module.css'

// Nav labels are UI copy (m.*); `link` targets are yours to wire.
const links = [
  { link: '/about', label: m.headersimple__features },
  { link: '/pricing', label: m.headersimple__pricing },
  { link: '/learn', label: m.headersimple__learn },
  { link: '/community', label: m.headersimple__community },
]

export function HeaderSimple() {
  const [opened, { toggle, close }] = useDisclosure(false)
  const [active, setActive] = useState(links[0].link)

  const items = links.map((link) => (
    <a
      key={link.link}
      href={link.link}
      className={classes.link}
      data-active={active === link.link || undefined}
      onClick={(event) => {
        event.preventDefault()
        setActive(link.link)
      }}
    >
      {link.label()}
    </a>
  ))

  return (
    <header className={classes.header}>
      <Container size="md" className={classes.inner}>
        <Wordmark name={m.app__name()} />
        <Group gap={5} visibleFrom="xs">
          {items}
        </Group>

        <Burger
          opened={opened}
          onClick={toggle}
          hiddenFrom="xs"
          size="sm"
          aria-label={m.headersimple__toggle_navigation()}
        />
      </Container>

      <Drawer
        opened={opened}
        onClose={close}
        size="100%"
        padding="md"
        title={m.headersimple__navigation()}
        hiddenFrom="xs"
        zIndex={1000000}
      >
        <ScrollArea h="calc(100dvh - 5rem)" mx="-md">
          <Divider my="sm" />
          {items}
        </ScrollArea>
      </Drawer>
    </header>
  )
}
