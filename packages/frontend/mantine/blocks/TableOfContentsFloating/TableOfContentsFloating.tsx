import { useState } from 'react'
import { TextSearch } from 'lucide-react'
import { Box, Group, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './TableOfContentsFloating.module.css'

// Section labels are UI copy (m.*); `link` anchors are yours to wire.
const links = [
  { label: m.tableofcontentsfloating__usage, link: '#usage', order: 1 },
  { label: m.tableofcontentsfloating__position, link: '#position', order: 1 },
  { label: m.tableofcontentsfloating__overlays, link: '#overlays', order: 1 },
  { label: m.tableofcontentsfloating__focus, link: '#focus', order: 1 },
  { label: m.tableofcontentsfloating__examples, link: '#examples', order: 1 },
  {
    label: m.tableofcontentsfloating__show_on_focus,
    link: '#show-on-focus',
    order: 2,
  },
  {
    label: m.tableofcontentsfloating__show_on_hover,
    link: '#show-on-hover',
    order: 2,
  },
  { label: m.tableofcontentsfloating__with_form, link: '#with-form', order: 2 },
]

export function TableOfContentsFloating() {
  const [active, setActive] = useState(2)

  const items = links.map((item, index) => (
    <Box<'a'>
      component="a"
      href={item.link}
      onClick={(event) => {
        event.preventDefault()
        setActive(index)
      }}
      key={item.link}
      className={`${classes.link} ${active === index ? classes.linkActive : ''}`}
      style={{ paddingLeft: `calc(${item.order} * var(--mantine-spacing-md))` }}
    >
      {item.label()}
    </Box>
  ))

  return (
    <div className={classes.root}>
      <Group mb="md">
        <TextSearch size={18} strokeWidth={1.5} />
        <Text>{m.tableofcontentsfloating__heading()}</Text>
      </Group>
      <div className={classes.links}>
        <div
          className={classes.indicator}
          style={{
            transform: `translateY(calc(${active} * var(--link-height) + var(--indicator-offset)))`,
          }}
        />
        {items}
      </div>
    </div>
  )
}
