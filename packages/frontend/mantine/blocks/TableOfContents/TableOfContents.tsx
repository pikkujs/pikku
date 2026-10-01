import { TextSearch } from 'lucide-react'
import { Box, Group, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './TableOfContents.module.css'

// Section labels are UI copy (m.*); `link` anchors are yours to wire.
const links = [
  { label: m.tableofcontents__usage, link: '#usage', order: 1 },
  { label: m.tableofcontents__position, link: '#position', order: 1 },
  { label: m.tableofcontents__overlays, link: '#overlays', order: 1 },
  { label: m.tableofcontents__focus, link: '#focus', order: 1 },
  { label: m.tableofcontents__examples, link: '#examples', order: 1 },
  { label: m.tableofcontents__show_on_focus, link: '#show-on-focus', order: 2 },
  { label: m.tableofcontents__show_on_hover, link: '#show-on-hover', order: 2 },
  { label: m.tableofcontents__with_form, link: '#with-form', order: 2 },
]

const active = '#overlays'

export function TableOfContents() {
  const items = links.map((item) => (
    <Box<'a'>
      component="a"
      href={item.link}
      onClick={(event) => event.preventDefault()}
      key={item.link}
      className={`${classes.link} ${active === item.link ? classes.linkActive : ''}`}
      style={{ paddingLeft: `calc(${item.order} * var(--mantine-spacing-md))` }}
    >
      {item.label()}
    </Box>
  ))

  return (
    <div>
      <Group mb="md">
        <TextSearch size={18} strokeWidth={1.5} />
        <Text>{m.tableofcontents__heading()}</Text>
      </Group>
      {items}
    </div>
  )
}
