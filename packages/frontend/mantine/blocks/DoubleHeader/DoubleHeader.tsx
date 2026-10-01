import { useState } from 'react'
import {
  Anchor,
  Box,
  Burger,
  Container,
  Divider,
  Drawer,
  Group,
  ScrollArea,
} from '@pikku/mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './DoubleHeader.module.css'

// Labels are UI copy (m.*); `link` targets are yours to wire.
const userLinks = [
  { link: '#', label: m.doubleheader__privacy_security },
  { link: '#', label: m.doubleheader__account_settings },
  { link: '#', label: m.doubleheader__support_options },
]

const mainLinks = [
  { link: '#', label: m.doubleheader__book_a_demo },
  { link: '#', label: m.doubleheader__documentation },
  { link: '#', label: m.doubleheader__community },
  { link: '#', label: m.doubleheader__academy },
  { link: '#', label: m.doubleheader__forums },
]

export function DoubleHeader() {
  const [opened, { toggle, close }] = useDisclosure(false)
  const [active, setActive] = useState(0)

  const mainItems = mainLinks.map((item, index) => (
    <Anchor<'a'>
      href={item.link}
      key={index}
      className={classes.mainLink}
      data-active={index === active || undefined}
      onClick={(event) => {
        event.preventDefault()
        setActive(index)
      }}
    >
      {item.label()}
    </Anchor>
  ))

  const secondaryItems = userLinks.map((item, index) => (
    <Anchor
      href={item.link}
      key={index}
      onClick={(event) => event.preventDefault()}
      className={classes.secondaryLink}
    >
      {item.label()}
    </Anchor>
  ))

  return (
    <header className={classes.header}>
      <Container className={classes.inner}>
        <Wordmark name={m.app__name()} />
        <Box className={classes.links} visibleFrom="sm">
          <Group justify="flex-end">{secondaryItems}</Group>
          <Group gap={0} justify="flex-end" className={classes.mainLinks}>
            {mainItems}
          </Group>
        </Box>
        <Burger
          opened={opened}
          onClick={toggle}
          className={classes.burger}
          size="sm"
          hiddenFrom="sm"
          aria-label={m.doubleheader__toggle_navigation()}
        />
      </Container>

      <Drawer
        opened={opened}
        onClose={close}
        size="100%"
        padding="md"
        title={m.doubleheader__navigation()}
        hiddenFrom="sm"
        zIndex={1000000}
      >
        <ScrollArea h="calc(100dvh - 5rem)" mx="-md">
          <Divider my="sm" />
          {mainLinks.map((item, index) => (
            <a
              href={item.link}
              key={index}
              className={classes.drawerLink}
              onClick={(event) => event.preventDefault()}
            >
              {item.label()}
            </a>
          ))}
          <Divider my="sm" />
          {userLinks.map((item, index) => (
            <a
              href={item.link}
              key={index}
              className={classes.drawerLink}
              onClick={(event) => event.preventDefault()}
            >
              {item.label()}
            </a>
          ))}
        </ScrollArea>
      </Drawer>
    </header>
  )
}
