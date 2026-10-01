import { Search } from 'lucide-react'
import { Autocomplete, Burger, Divider, Drawer, Group, ScrollArea } from '@pikku/mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { asI18n, m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'
import classes from './HeaderSearch.module.css'

// Nav labels are UI copy (m.*); `link` targets are yours to wire.
const links = [
  { link: '/about', label: m.headersearch__features },
  { link: '/pricing', label: m.headersearch__pricing },
  { link: '/learn', label: m.headersearch__learn },
  { link: '/community', label: m.headersearch__community },
]

// Framework names are opaque data (proper nouns), not translatable UI copy.
const searchData = ['React', 'Angular', 'Vue', 'Next.js', 'Riot.js', 'Svelte', 'Blitz.js'].map(
  asI18n,
)

export function HeaderSearch() {
  const [opened, { toggle, close }] = useDisclosure(false)

  const items = links.map((link) => (
    <a
      key={link.link}
      href={link.link}
      className={classes.link}
      onClick={(event) => event.preventDefault()}
    >
      {link.label()}
    </a>
  ))

  return (
    <header className={classes.header}>
      <div className={classes.inner}>
        <Group>
          <Burger
            opened={opened}
            onClick={toggle}
            size="sm"
            hiddenFrom="sm"
            aria-label={m.headersearch__toggle_navigation()}
          />
          <Wordmark name={m.app__name()} />
        </Group>

        <Group>
          <Group ml={50} gap={5} className={classes.links} visibleFrom="sm">
            {items}
          </Group>
          <Autocomplete
            className={classes.search}
            placeholder={m.headersearch__search_placeholder()}
            leftSection={<Search size={16} strokeWidth={1.5} />}
            data={searchData}
            visibleFrom="xs"
          />
        </Group>
      </div>

      <Drawer
        opened={opened}
        onClose={close}
        size="100%"
        padding="md"
        title={m.headersearch__navigation()}
        hiddenFrom="sm"
        zIndex={1000000}
      >
        <ScrollArea h="calc(100dvh - 5rem)" mx="-md">
          <Divider my="sm" />
          <Autocomplete
            placeholder={m.headersearch__search_placeholder()}
            leftSection={<Search size={16} strokeWidth={1.5} />}
            data={searchData}
            mx="md"
            mb="sm"
          />
          {items}
        </ScrollArea>
      </Drawer>
    </header>
  )
}
